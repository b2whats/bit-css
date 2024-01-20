import { TokenType } from './scanner'
import { Term } from './term'

const operators = new Map([
  [ "||", 1 ],
  [ "&&", 2 ],
  [ "==", 3 ],
  [ "!=", 3 ],
  [ "<",  3 ],
  [ ">",  3 ],
  [ "<=", 3 ],
  [ ">=", 3 ],
  [ "-",  4 ],
  [ "!",  4 ],
])

export class Parser {
  keywords = 'if|match|token'

  constructor(scanner) {
    this.scanner = scanner
  }

  parse(source, scheme) {
    this.scheme = scheme
    this.scanner.init(source)
    let result = ''
    
    let match = this.scanner.nextTo(this.keywords)

    while (match[1] !== null) {
      this.lookahead = match[1]
      result += match[0] + this.KeywordExpression()

      match = this.scanner.nextTo(this.keywords)
    }

    result += match[0]

    return result
  }

  testMethod(method) {
    return (source) => {
      this.scanner.init(source)
      this.lookahead = this.scanner.nextToken()
  
      return this.lookahead !== null ? this[method]() : null
    }
  }

  eat(tokenType, lookahead = true) {
    const token = this.lookahead

    if (token === null) {
      throw new SyntaxError(`Unexpected end of input, expected "${tokenType}"`)
    }

    if (token.type !== tokenType) {
      throw new SyntaxError(
        `Unexpected token: "${token.value}", expected "${tokenType}"`
      )
    }

    if (lookahead === false) return null

    this.lookahead = this.scanner.nextToken()

    return token
  }

  eatUntil(stopTokens, innerTokens, innerTokensCallback) {
    const [before, match] = this.scanner.nextUntil(stopTokens, innerTokens, (innerMatch) => {
      this.lookahead = innerMatch

      return innerTokensCallback.call(this)
    })

    if (match === null) throw new SyntaxError(`Unexpected end of input, expected "${stopTokens}"`)

    this.lookahead = match

    return before
  }

  KeywordExpression() {
    switch (this.lookahead.type) {
      case 'if': return this.IfExpression()
      default: return ''
    }
  }

  IfExpression() {
    this.eat('if')
    this.eat('(')
    const test = this.PrecedenceExpression()
    this.eat(',', false)
    
    const consequent = this.MixedExpression(',|)')
    let alternate = null
    if (this.lookahead.type === ',') {
      this.eat(',', false)
      alternate = this.MixedExpression(')')
    }
    this.eat(')', false)

    return this.IfSerialize(test, consequent, alternate)
  }

  MixedExpression(stopTokens) {
    return this.eatUntil(stopTokens, this.keywords, this.KeywordExpression)

  }

  Expression() {
    switch (this.lookahead.type) {
      case '(': return this.ParenthesizedExpression()
      case '{': return this.ObjectExpression()
      case '[': return this.ArrayExpression()
      default: return this.CallMemberExpression()
    }
  }

  getPrecedence(operator) {
    return operators.get(operator) || 0
  }

  PrecedenceExpression(prec = 0) {
    let left
    switch (this.lookahead.type) {
      case '(': {
        this.eat('(')
        left = this.PrecedenceExpression()
        this.eat(')')

        break
      }
      case '!': {
        this.eat('!')
        left = this.PrecedenceExpression(this.getPrecedence('!')).negate()
        break
      }
      case '-': {
        this.eat('-')
        left = this.PrecedenceExpression(this.getPrecedence('-'))
        left.value = left.value[0] === '-' ? left.value.slice(1) : '-' + left.value
        break
      }
      default: {
        if (TokenType[this.lookahead.type] === undefined) {
          throw new SyntaxError(`Unexpected token type: "${this.lookahead.type}" Expected identifier or literal`)
        }

        const token = this.eat(this.lookahead.type)
        left = new Term(token.type, token.value)
      }
    }

    while (prec < this.getPrecedence(this.lookahead?.type)) {
      const token = this.eat(this.lookahead.type)

      left = new Term(token.type, left, this.PrecedenceExpression(this.getPrecedence(token.type)))
    }

    return left
  }

  ParenthesizedExpression() {
    this.eat('(')
    const expression = this.Expression()
    this.eat(')')

    return expression
  }

  ArrayExpression() {
    const list = []
    this.eat('[')

    while(this.lookahead.type !== ']') {
      list.push(this.Expression())
      if (this.lookahead.type === ',') this.eat(',')
    }

    this.eat(']')

    return {
      type: 'ArrayExpression',
      elements: list
    }
  }
  /**
   * ObjectExpression
   *    = "{" ObjectProperty+ "}"
   */
  ObjectExpression() {
    const list = []
    this.eat('{')

    while(this.lookahead.type !== '}') {
      list.push(this.ObjectProperty())
      
    }

    this.eat('}')

    return {
      type: 'ObjectExpression',
      properties: list
    }
  }

  /**
   * ObjectProperty
   *    = Identifier ":" ExpressionStatement
   */
  ObjectProperty() {
    const key = this.Identifier()
    this.eat(':')
    const value = this.Expression()
    if (this.lookahead.type === ',') this.eat(',')

    return {
      key, value
    }
  }

  /**
   * CallMemberExpression
   *    = MemberExpression
   *    / CallExpression
   */
  CallMemberExpression() {
    let member = this.MemberExpression()

    if (this.lookahead?.type === '(') {
      member = this.CallExpression(member)
    }

    return member
  }

  /**
   * CallExpression
   *    = MemberExpression Arguments
   */
  CallExpression(callee) {
    let args

    this.eat('(')
    args = this.ArgumentList()

    this.eat(')')

    return {
      type: 'CallExpression',
      callee,
      arguments: args
    }
  }

  /**
   * ArgumentList
   *    = ExpressionStatement+
   */
  ArgumentList() {
    const args = []
    if (this.lookahead.type === ')') return []

    while(this.lookahead.type !== ')') {
      args.push(this.Expression())
      if (this.lookahead.type === ',') this.eat(',')
    }

    return args
  }

  /**
   * PrimaryExpression
   *    = Literal
   *    / Identifier
   */
  PrimaryExpression() {
    switch (this.lookahead.type) {
      case TokenType.Identifier: return this.Identifier()
      default: return this.Literal()
    }
  }

  /**
   * MemberExpression
   *    = PrimaryExpression
   *    / MemberExpression "." PrimaryExpression
   *    / MemberExpression "[" PrimaryExpression "]"
   *    / CallExpression 
   */
  MemberExpression() {
    let object = this.PrimaryExpression()

    while(this.lookahead) {
      if (this.lookahead.type === '.') {
        this.eat('.')
        const property = this.PrimaryExpression()

        object = {
          type: 'MemberExpression',
          computed: false,
          object,
          property
        }
      } else if (this.lookahead.type === '[') {
        this.eat('[')
        const property = this.PrimaryExpression()
        this.eat(']')

        object = {
          type: 'MemberExpression',
          computed: true,
          object,
          property
        }
      } else if (this.lookahead.type === '(') {
        object = this.CallExpression(object)
      } else {
        break
      }
    }

    return object
  }

  /**
   *  Identifier: 
   *    = Identifier
   */
  Identifier() {
    return {
      type: TokenType.Identifier,
      name: this.eat(TokenType.Identifier).value
    }
  }
  
  /* 
    Literal: 
      Number
      String
      Boolean
      Null
  */
  Literal() {
    const type = this.lookahead.type

    if (type !== TokenType.Literal) {
      throw new SyntaxError(`Unexpected token type for literal "${type}"`)
    }

    return { type, value: this.eat(type).value }
  }

  IfSerialize(term, consequent, alternate) {
    switch (term.type) {
      case TokenType.Literal: {
        return term.toBoolean() ? consequent : (alternate || '')
      }
      case '||':
      case '&&': {
        const name = this.termName(term)
        let result = ''
    
        if (alternate) {
          const alternateTerm = term.clone().negate().toNNF()
          this.termName(alternateTerm)
          const elseValue = this.termValue(alternateTerm.distributeConjunction(true), null)
          const elseName = `else-${name}`
          this.scheme.addPreparedCondition(elseName, elseValue)
    
          result = ` var(--${elseName},${alternate})`
        }
    
        const ifValue = this.termValue(term.toDNF(true), null)
        const ifName = `if-${name}`
        this.scheme.addPreparedCondition(ifName, ifValue)
        result = `var(--${ifName},${consequent})` + result
        
        return result
      }
      default: {
        let result = `var(--${this.termName(term)},${consequent})`

        if (alternate !== null) result += ` var(--${this.termName(term.negate().toNNF())},${alternate})`
        
        return result
      }
    }
  }

  termName(termExpression) {
    let result = termExpression.toString((term) => {
      switch (term.type) {
        case TokenType.Identifier:
          if (term.parent === null) this.scheme.addCondition(term.value, '!', term.negated)
          break
        case '||':
        case '&&':
          if (term.left.type === TokenType.Identifier) this.scheme.addCondition(term.left.value, '!', term.left.negated)
          if (term.right.type === TokenType.Identifier) this.scheme.addCondition(term.right.value, '!', term.right.negated)
          break
        case TokenType.Literal: break
        default:
          this.scheme.addCondition(term.left.value, term.type, term.right.toString())
          break
      }
    })

    return this.scheme.replaceOperators(result)
  }

  termValue(term, parentType) {
    switch (term.type) {
      case TokenType.Literal: return term.toBoolean() ? 'var(--true)' : 'var(--false)' 
      case TokenType.Identifier: return `var(--${this.scheme.replaceOperators(term.toString())})`
    
      case '||': {
        const left = this.termValue(term.left, term.type)
        const right = this.termValue(term.right, term.type)

        return `${left} ${right}`
      }
      case '&&': {
        const left = this.termValue(term.left, term.type)
        const right = this.termValue(term.right, term.type)

        let result = `${left}, ${right}`

        if (parentType !== '&&') {
          let endBracket = ''
          result = result.replace(/\),/g, () => { endBracket += ')'; return ',' }) + endBracket
        }

        return result
      }
      default: {
        let result = this.scheme.replaceOperators(`${term.left.toString()}${term.type}${term.right.toString()}`)
        
        return `var(--${result})`
      }
    }
  }
}