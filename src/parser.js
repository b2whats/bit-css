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
  options = { toAst: false }
  scanner = null

  constructor(scanner) {
    this.scanner = scanner
  }

  parse(source) {
    this.source = source
    this.tokenizer = new Tokenizer(source)
    this.lookahead = this.tokenizer.nextToken()

    return this.lookahead !== null ? this.ExpressionStatement() : null
  }

  testMethod(method) {
    return (source) => {
      this.scanner.init(source)
      this.lookahead = this.scanner.nextToken()
  
      return this.lookahead !== null ? this[method]() : null
    }
  }

  eat(tokenType) {
    const token = this.lookahead

    if (token == null) {
      throw new SyntaxError(`Unexpected end of input, expected "${tokenType}"`)
    }

    if (token.type !== tokenType) {
      throw new SyntaxError(
        `Unexpected token: "${token.value}", expected "${tokenType}"`
      )
    }

    this.lookahead = this.scanner.nextToken()

    return token
  }

  eatTo(startTokenType, EndTokenType) {
    let token = this.lookahead

    if (token == null) {
      throw new SyntaxError(`Unexpected end of input, expected "${tokenType}"`)
    }

    if (token.type !== startTokenType) {
      throw new SyntaxError(
        `Unexpected token: "${token.value}", expected "${tokenType}"`
      )
    }

    token = this.tokenizer.nextToToken(EndTokenType)
    this.lookahead = this.tokenizer.nextToken()

    return token
  }

  /**
   * ExpressionStatement
   *    = Expression
   *    / ObjectExpression
   *    / ArrayExpression
   */
  ExpressionStatement() {
    switch (this.lookahead.type) {
      case '{': return this.ObjectExpression()
      case '[': return this.ArrayExpression()
      default: return this.Expression()
    }
  }
  /**
   * Expression
   *    = Prefix (Infix)*
   */
  Expression(prec = 0) {
    let left = this.Prefix()

    while (prec < this.getPrecedence(this.lookahead?.type)) {
      left = this.Infix(left, this.lookahead.type)
    }

    return left
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

  /**
   * Prefix
   *    = ParenthesizedExpression
   *    / UnaryExpression
   *    / Identifier
   *    / Literal
   */
  Prefix() {
    switch (this.lookahead.type) {
      case '(': return this.ParenthesizedExpression()
      case '!':
      case '-': return this.UnaryExpression()
      default: return this.CallMemberExpression()
    }
  }

  /**
   * Infix
   *    = (|| && == != <= >=) Expression
   */
  Infix(left, operator) {
    let token = this.eat(operator)
    let prec = this.getPrecedence(token.type)

    if (this.options.toAst) {
      return {
        type: 'BinaryExpression',
        operator: token.type,
        left,
        right: this.Expression(prec)
      }
    } else {
      return new Term(token.type, left, this.Expression(prec))
    }
  }

  /**
   * ParenthesizedExpression
   *    = "(" Expression ")"
   */
  ParenthesizedExpression() {
    this.eat('(')
    const expression = this.ExpressionStatement()
    this.eat(')')

    return expression
  }

  /**
   * ArrayExpression
   *    = "[" ExpressionStatement+ "]"
   */
  ArrayExpression() {
    const list = []
    this.eat('[')

    while(this.lookahead.type !== ']') {
      list.push(this.ExpressionStatement())
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
      if (this.lookahead.type === ',') this.eat(',')
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
    const value = this.ExpressionStatement()

    return {
      key, value
    }
  }

  /**
   * UnaryExpression
   *    = (- !) Expression
   */
  UnaryExpression() {
    const operator = this.lookahead.type
    this.eat(operator)

    if (this.options.toAst) {
      return {
        type: 'UnaryExpression',
        value: this.Expression(this.getPrecedence(operator))
      }
    } else {
      return this.Expression(this.getPrecedence(operator)).negate()
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

    if (callee.type === TokenType.Identifier && callee.name === 'token') {
      args = [this.eatTo('(', ')')]
    } else {
      this.eat('(')
      args = this.ArgumentList()
    }

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
      args.push(this.ExpressionStatement())
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
    if (this.options.toAst) {
      return {
        type: TokenType.Identifier,
        name: this.eat(TokenType.Identifier).value
      }
    } else {
      return new Term(Token.IDENTIFIER, this.eat(TokenType.Identifier).value)
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

    if (TokenType[type] === undefined) {
      throw new SyntaxError(`Unexpected token type for literal "${type}"`)
    }

    let value = this.eat(type).value

    if (type === TokenType.Number) value = +value

    if (this.options.toAst) {
      return { type, value }
    } else {
      return new Term(Token.LITERAL, value)
    }
  }
}