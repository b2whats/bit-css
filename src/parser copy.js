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

const operatorStringType = new Map([
  [ "||", '⋁' ],
  [ "&&", '∧' ],
  [ "==", '≡' ],
  [ "!=", '≠' ],
  [ "<",  '⋖' ],
  [ ">",  '⋗' ],
  [ "<=", '⋜' ],
  [ ">=", '⋝' ],
  [ "-",  '-' ],
  [ "!",  '¬' ],
  [ "(",  '∣' ],
  [ ")",  '∣' ],
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
    // return `if([${test}],[${consequent}]${alternate ? `,[${alternate}]` : ''})`
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
      case '!':
      case '-': {
        const operator = this.eat(this.lookahead.type).type
        left = this.PrecedenceExpression(this.getPrecedence(operator)).negate()
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
          const elseName = `--else-${name}`
          const elseValue = this.termValue(alternateTerm.distributeConjunction(true), null)
          this.scheme.addDeclaration(elseName, elseValue)
    
          result = ` var(${elseName},${alternate})`
        }
    
        const ifName = `--if-${name}`
        const ifValue = this.termValue(term.toDNF(true), null)
        this.scheme.addDeclaration(ifName, ifValue)
        result = `var(${ifName},${consequent})` + result
        
        return result
      }
      default: {
        let result = `var(--${this.termName(term)},${consequent})`

        if (alternate !== null) result += ` var(--${this.termName(term.negate())},${alternate})`
        
        return result
      }
    }
  }

  replaceTermOperator(operator) {
    return operatorStringType.get(operator) || operator
  }

  termName(term) {
    switch (term.type) {
      case TokenType.Literal:
        if (term.typeOf === 1) return term.negated ? this.replaceTermOperator('-') + term.value : term.value
  
        return term.value
      case TokenType.Identifier:
        if (term.parent === null) this.scheme.addListRule(term.value, 'bool', term.negated)
        return term.negated ? this.replaceTermOperator('!') + term.value : term.value
      default: {
        switch (term.type) {
          case '||':
          case '&&':
            if (term.left.type === TokenType.Identifier) this.scheme.addListRule(term.left.value, 'bool', term.left.negated)
            if (term.right.type === TokenType.Identifier) this.scheme.addListRule(term.right.value, 'bool', term.right.negated)
            break;
          default:
            this.scheme.addListRule(term.left.value, term.type, term.right.toPrimitive())
            break;
        }

        let str = `${this.termName(term.left)}${this.replaceTermOperator(term.type)}${this.termName(term.right)}`
  
        if (term.negated || term.type !== (term.parent?.type || term.type)) str = `${this.replaceTermOperator('(')}${str}${this.replaceTermOperator(')')}`
  
        return (term.negated ? this.replaceTermOperator('!') + str : str)
      }
    }
  }

  termValue(term, parentType) {
    switch (term.type) {
      case TokenType.Literal:
        if (parentType === '||' || parentType === '&&') {
          let alternate = 'var(--OFF)'
          let consequent = 'var(--ON)'

          if (term.typeOf === 1) return term.value === '0' ? alternate : consequent

          if (term.negated) [alternate, consequent] = [consequent, alternate]

          if (term.typeOf === 4) return term.value === '' ? alternate : consequent
          if (term.typeOf === 3) return alternate
          if (term.typeOf === 2) return term.value === 'true' ? consequent : alternate      
        }

        if (term.typeOf === 1) return term.negated ? this.replaceTermOperator('-') + term.value : term.value
  
        return term.negated ? this.replaceTermOperator('!') + term.value : term.value
      case TokenType.Identifier: {
        let result = `${term.negated ? this.replaceTermOperator('!') : ''}${term.value}`

        if (parentType === '||' || parentType === '&&') result = `var(--${result})`

        return result
      }
      case '||':
      case '&&': {
        const left = this.termValue(term.left, term.type)
        const right = this.termValue(term.right, term.type)

        if (term.type === '||') return `${left} ${right}`

        let result = `${left}, ${right}`

        if (parentType !== '&&') {
          let postfix = ''
          result = result.replace(/\),/g, () => {postfix += ')'; return ','}) + postfix
        }

        return result
      }
      default: {
        const left = this.termValue(term.left, term.type)
        const right = this.termValue(term.right, term.type)

        return `var(--${left}${this.replaceTermOperator(term.type)}${right})`
      }
    }
  }
}