export class Scheme {
  on = 'initial'
  off = ' '
  name = ''
  variables = {}
  declarations = {}
  rules = {}
  buffer = ''

  constructor(name) {
    this.name = name
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

  addDeclaration(name, value) {
    this.declarations[name] = value
  }

  addRule(name, type, value) {
    if (this.variables[name] === undefined) {
      this.variables[name] = {}
    }

    if (this.variables[name][type] === undefined) {
      this.variables[name][type] = new Set()
    }

    this.variables[name][type].add(value)
  }

  flushBuffer() {
    const result = this.buffer
    this.buffer = ''

    return result
  }

  addProperty(property, value) {
    if (property.startsWith('--') === false) property = '--' + property

    this.buffer += `${property}:${value};\r\n`
  }

  createRuleFunction() {
    let fnBody = `let result = ''\r\n`

    return (variable, operator, value) => {
      if (variable === undefined) {
        console.log(fnBody)
      } else {
        switch (operator) {
          case '!':
            fnBody += `const booleanValue = !!${variable}\r\n`
            if (value === true)  fnBody += `if (booleanValue === true)  result += '--${variable}:${this.on};'\r\n`
            if (value === false) fnBody += `if (booleanValue === false) result += '--${this.operatorsMap(operator)}${variable}:${this.off};'\r\n`
            break
          case '==': {
            const variableName = `${variable}${this.operatorsMap(operator)}${this.replaceOperators(value)}`

            if (/^true|false|null|-?\d|'/.exec(value) === null) {
              value = value.replace(/!/, '!props.') || `props.${value}`
            }

            fnBody += `if (props.${variable} ${operator}= ${value}) result += '--${variableName}:${this.on};'\r\n`
            fnBody += `else result += '--${variableName}:${this.off};'\r\n`

            break
          }
          default: {
            const variableName = `${variable}${this.operatorsMap(operator)}${this.replaceOperators(value)}`
            const isEqualOperator = operator === '==' || operator === '!='
            isEqualOperator && (operator += '=')

            if (/^true|false|null|-?\d|'/.exec(value) === null) {
              value = value.replace(/!/, '!props.') || `props.${value}`
            }

            fnBody += `if (props.${variable} ${operator} ${value}) result += '--${variableName}:${this.on};'\r\n`

            if (isEqualOperator) fnBody += `else result += '--${variableName}:${this.off};'\r\n`

            break
          }
        }
      }
    }
  }

  makeInitialDeclarations() {
    for (const [property, value] of Object.entries(this.declarations)) {
      this.addProperty(property, value)
    }

    for (const [variable, operatorList] of Object.entries(this.variables)) {
      for (const [operator, values] of Object.entries(operatorList)) {
        let addCondition = this.createRuleFunction()
        switch (operator) {
          case '!':
            if (values.has(true)) {
              this.addProperty(variable, this.off)
              addCondition(variable, operator, true)
            }
            if (values.has(false)) {
              this.addProperty(this.operatorsMap(operator) + variable, this.on)
              addCondition(variable, operator, true)
            }
            break
          case '!=':
          case '==':
            const leftSide = variable + this.operatorsMap(operator)
            let toggle = operator === '!=' ? this.on : this.off
            values.forEach(value => {
              if (/^true|false|null|-?\d|'/.exec(value) === null && !value.startsWith('!')) toggle = operator === '!=' ? this.off : this.on
              this.addProperty(`${leftSide}${this.replaceOperators(value)}`, toggle)
              addCondition(variable, operator, value)
            })
            break
          default: {
            const leftSide = variable + this.operatorsMap(operator)

            values.forEach(value => {
              this.addProperty(`${leftSide}${this.replaceOperators(value)}`, this.off)
              addCondition(variable, operator, value)
            })
            break
          }
        }
        addCondition()
      }
    }

    return this.flushBuffer()
  }

  generateCreationRules() {
    let fabric = {}
    for (const [variable, operatorList] of Object.entries(this.variables)) {
      let result = `let result = ''\r\n`
      for (let [operator, values] of Object.entries(operatorList)) {
        switch (operator) {
          case '!':
            if (values.has(true))  result += `if ('${variable}' in props) result += '--${variable}:${this.on};'\r\n`
            if (values.has(false)) result += `if ('${variable}' in props === false) result += '--${this.operatorsMap(operator)}${variable}:${this.off};'\r\n`
            break
          default: {
            values.forEach(value => {
              if (/^true|false|null|-?\d|'/.exec(value) === null) {
                value = value.replace(/!/, '!props.') || `props.${value}`
              }
              const variableName = `${variable}${this.operatorsMap(operator)}${this.replaceOperators(value)}`
              result += `if (props.${variable} ${operator} ${value}) result += '--${variableName}:${this.on};'\r\n`

              if (operator === '!=' || operator === '==') {
                result += `else result += '--${variableName}:${this.off};'\r\n`
              }
            })
            break
          }
        }
      }
      console.log(result)
    }
  }

  createRule(name, value) {

  }
}