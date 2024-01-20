import { hash } from './hash'
export class Scheme {
  on = 'initial'
  off = ' '
  className = ''
  rules = {}
  conditions = {}
  preparedConditions = new Map()
  buffer = new Map()
  cache = new Map()
  variables = new Set()

  constructor(name) {
    this.className = `.${name}` 
    this.operatorsRe = /\|\||&&|==|!=|<=|>=|<|>|-|!|'|\(|\)/g
  }

  operatorsMap(match) {
    switch (match) {
      case '||': return 'v'
      case '&&': return '∧'
      case '==': return '≡'
      case '!=': return '≠'
      case '<':  return '⋖'
      case '>':  return '⋗'
      case '<=': return '⋜'
      case '>=': return '⋝'
      case '-':  return '-'
      case '!':  return '¬'
      case '(':  return '∣'
      case ')':  return '∣'
      case '\'':  return '´'
      default: return match
    }
  }

  replaceOperators(value) {
    return value.replace(this.operatorsRe, this.operatorsMap)
  }

  addPreparedCondition(name, value) {
    this.preparedConditions.set(name, value)
  }

  addCondition(name, operator, value) {
    if (this.conditions[name] === undefined) {
      this.conditions[name] = {}
    }

    if (this.conditions[name][operator] === undefined) {
      this.conditions[name][operator] = new Set()
    }

    this.conditions[name][operator].add(value)
  }

  makeInitialRule() {
    let result = ''

    return [
      (variable, value) => {
        result += `--${variable}:${value};\r\n`
      },
      () => {
        this.className = `${this.className}-${hash(result)}`
        this.buffer.set(this.className, `{${result}}`)
      }
    ]
  }

  templateCacheKey(variable) {
    let body, args
    if (Array.isArray(variable)) {
      args = `{${variable.join(',')}}`
      body = variable.map(name => `${name}:\${${name}}`).join(' ')
    } else {
      args = variable
      body = `${variable}:\${${variable}}`
    }

    return new Function(args, `return \`${body}\``)
  }

  ruleClassName(value) {
    return `${this.className}[data-props~="${value}"]`
  }

  dependenciesRuleClassName(variable, prefix, value) {
    return `${prefix}[data-${variable}-deps="${value}"]`
  }

  makeRuleFunctions(variable) {
    let body = `let result = ''\r\n`
    let bodyDependencies = body
    let dependencies = new Set()
    this.variables.add(variable)

    return [(operator, value) => {
      switch (operator) {
        case '!':
          if (value.has(true))  body += `if (${variable})  result += '--${variable}:${this.on};'\r\n`
          if (value.has(false)) body += `if (!${variable}) result += '--${this.operatorsMap(operator)}${variable}:${this.off};'\r\n`
          break
        default: {
          const variableName = `${variable}${this.operatorsMap(operator)}${this.replaceOperators(value)}`
          let identifier = false
          let left = variable
          if (operator === '==' || operator === '!=') operator += '='

          if (/^Number|String|Function|Boolean$/.exec(value) !== null) {
            left = `typeof ${variable}`
            value = `'${value.toLowerCase()}'`
          } else if (/^true|false|null|-?\d|'/.exec(value) === null) {
            const name = value.startsWith('!') ? value.slice(1) : value
            this.variables.add(name)
            variable !== name && dependencies.add(name)
            identifier = true
          }

          let tmp = `if (${left} ${operator} ${value}) result += '--${variableName}:${this.on};'\r\n`

          if (identifier) bodyDependencies += tmp
          else body += tmp
          break
        }
      }},
      () => {
        body += `if (result === '') return null\r\n`
        body += `return '{' + result + '}'`

        this.rules[variable] = new Function(variable, body)
        this.rules[variable].cacheKey = this.templateCacheKey(variable)

        if (dependencies.size !== 0) {
          dependencies = [...dependencies]
          bodyDependencies += `if (result === '') return null\r\n`
          bodyDependencies += `return '{' + result + '}'`

          this.rules[variable].dependence = new Function(`{${variable},${dependencies.join(',')}}`, bodyDependencies)
          this.rules[variable].dependence.cacheKey = this.templateCacheKey(dependencies)
        }
      }
    ]
  }

  prepareStyles() {
    const [addDeclaration, flushRule] = this.makeInitialRule()

    for (const [cssVariable, value] of this.preparedConditions) {
      addDeclaration(cssVariable, value)
    }
    const rules = []
    for (const [variable, operatorList] of Object.entries(this.conditions)) {
      const [addCondition, createFunction] = this.makeRuleFunctions(variable)
      for (const [operator, values] of Object.entries(operatorList)) {
        switch (operator) {
          case '!':
            if (values.has(true)) {
              addDeclaration(variable, this.off)
            }
            if (values.has(false)) {
              addDeclaration(this.operatorsMap(operator) + variable, this.on)
            }
            addCondition(operator, values)
            break
          default: {
            const leftSide = variable + this.operatorsMap(operator)

            values.forEach(value => {
              addDeclaration(`${leftSide}${this.replaceOperators(value)}`, this.off)
              addCondition(operator, value)
            })
            break
          }
        }
      }
      rules.push(createFunction)
    }

    flushRule()
    rules.forEach(fn => fn())
  }


  prepareRules(properties) {
    for (const [property, values] of Object.entries(properties)) {
      const fn = this.rules[property]
      if (fn) {
        values.forEach(v => {
          if (typeof v === 'object') {
            this.serialize(v)
          } else {
            this.serialize({ [property]: v })
          }
        })
      } else {
        throw new SyntaxError(`Variable "${property}" does not participate in the formation of style for the selector "${this.className}"`)
      }
    }
  }

  valuePropertiesStringify(properties) {
    const result = {}

    this.variables.forEach(name => {
      const value = properties[name]
      result[name] = (
        value === undefined ? 'none' :
        typeof value === 'function' ? 'fn' :
        value
      )
    })

    return result
  }

  serialize(properties) {
    const result = {
      'data-props': ''
    }
    const stringifyProperties = this.valuePropertiesStringify(properties)

    for (const name in properties) {
      const make = this.rules[name]

      if (make) {
        const value = properties[name]
        if (value === undefined) continue
        const cacheKey = make.cacheKey(stringifyProperties[name])
        let parentCache = this.cache.get(cacheKey)

        if (parentCache === undefined) {
          const declarations = make(value)
          if (declarations !== null) {
            this.buffer.set(this.ruleClassName(cacheKey), declarations)
          }
          parentCache = new Set()
          this.cache.set(cacheKey, parentCache)
        }

        result['data-props'] += cacheKey + ' '

        if (make.dependence) {
          const depsCacheKey = make.dependence.cacheKey(stringifyProperties)

          if (parentCache.has(depsCacheKey) === false) {
            const declarations = make.dependence(properties)
            if (declarations !== null) {
              const className = this.dependenciesRuleClassName(name, this.ruleClassName(cacheKey), depsCacheKey)
              this.buffer.set(className, declarations)
            }
            parentCache.add(depsCacheKey)
          }

          result[`data-${name}-deps`] = depsCacheKey
        }
      }
    }
    result['data-props'] = result['data-props'].trim()

    return result
  }
}