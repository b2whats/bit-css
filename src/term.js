import { TokenType } from './scanner'

const operators = new Map([
  [ "||", '&&' ],
  [ "&&", '||' ],
  [ "==", '!=' ],
  [ "!=", '==' ],
  [ "<",  '>=' ],
  [ ">",  '<=' ],
  [ "<=", '>'  ],
  [ ">=", '<'  ],
  [ "-",  '-'  ],
  [ "!",  '!'  ],
])

const assert = (cond, message) => { if (cond) throw new SyntaxError(message) }

export function Term(type, left, right) {
  this.type = type
  this.negated = false
  this.left = null
  this.right = null
  this.value = null
  this.parent = null
  // 1 - number 2- boolean 3 - null 4 - string
  this.typeOf = 0 

  // TODO: Проверка при создании выражений X .. number что левая часть это identifier а правая число
  switch (type) {
    case '==':
      if (left.type === TokenType.Identifier) {
        assert(left.negated, `left side "${left}" of the expression "${left} ${type} ${right}" mustn't be negated`)
        // A == true -> A 
        if (right.value === 'true') {
          this.type = TokenType.Identifier
          this.value = left.value
          break
        }
        // A == false -> !A
        if (right.value === 'false') {
          this.type = TokenType.Identifier
          this.value = left.value
          this.negated = true
          break
        }
      }
    case '!=':
      if (left.type === TokenType.Identifier) {
        assert(left.negated, `left side "${left}" of the expression "${left} ${type} ${right}" mustn't be negated`)
        // A != false -> A
        if (right.value === 'false') {
          this.type = TokenType.Identifier
          this.value = left.value
          break
        }
        // A != true -> !A 
        if (right.value === 'true') {
          this.type = TokenType.Identifier
          this.value = left.value
          this.negated = true
          break
        }
      }
    case '>':
    case '<':
    case '>=':
    case '<=':
      assert(left.type !== TokenType.Identifier, `left side "${left}" of the expression "${left} ${type} ${right}"  must be an identifier`)
      assert(right.type !== TokenType.Literal && right.type !== TokenType.Identifier, `right side "${right}" of the expression "${left} ${type} ${right}"  must be a literal or identifier`)
      assert(left.negated, `left side "${left}" of the expression "${left} ${type} ${right}" mustn't be negated`)
    case '||':
    case '&&':
      this.left  = left
      this.right = right
      left.parent = this
      right.parent = this
      break
    case TokenType.Identifier:
      this.value = left
      break
    case TokenType.Literal:
      this.value = left

      if (/^\d/.exec(this.value) !== null) this.typeOf = 1
      else if (/^(true|false)/.exec(this.value) !== null) this.typeOf = 2
      else if (/^(null)/.exec(this.value) !== null) this.typeOf = 3
      else this.typeOf = 4

      break
    default: {
      throw new SyntaxError(`Unexpected type of Term "${type}"`)
    }
  }
}

Term.prototype.negate = function () {
  this.negated = !this.negated

  return this
}

Term.prototype.hasChildren = function () {
  return this.left !== null
}

Term.prototype.deMorgen = function () {
  if (this.hasChildren()) {
    this.negate()
    this.type = operators.get(this.type)

    if (this.type === '&&' || this.type === '||') {
      this.left.negate()
      this.right.negate()
    }
  }

  return this
}

// !(A || (B && C)) -> !A && !B || !C
// !(A || (B > 1)) -> !A && !(B > 1)
// Negation Normal Form
Term.prototype.toNNF = function () {
  if (this.negated) this.deMorgen()

  if (this.hasChildren()) {
    this.left.toNNF()
    this.right.toNNF()
  }

  return this
}

// (A && B) || C -> (A || C) && (B || C)
Term.prototype.distributeDisjunction = function (isPerfect = false) {
  if (this.hasChildren()) {
    this.left.distributeDisjunction();
    this.right.distributeDisjunction();
  }

  if (this.type === '||') {
    var decompose       // (A && B)
    var inject          // C

    if (this.left.type === '&&') {
      decompose = this.left
      inject    = this.right
    } else if (this.right.type === '&&') {
      decompose = this.right
      inject    = this.left
    } else {
      return this
    }

    this.type  = '&&'
    // (A || C)
    this.left  = inject.equalTo(decompose.left) ? inject : new Term('||', decompose.left, inject)
    // (B || C)
    this.right = inject.equalTo(decompose.right) ? inject : new Term('||', decompose.right, inject)

    if (isPerfect && (inject.type === '&&' || decompose.left.type === '&&' || decompose.right.type === '&&')) {
      this.left.distributeDisjunction()
      this.right.distributeDisjunction()
    }
  }

  return this
};

// (A || B) && C -> (A && C) || (B && C)
Term.prototype.distributeConjunction = function (isPerfect = false) {
  if (this.hasChildren()) {
    this.left.distributeConjunction(isPerfect)
    this.right.distributeConjunction(isPerfect)
  }

  if (this.type === '&&') {
    var decompose        // (A || B)
    var inject           // C

    if (this.left.type === '||') {
      decompose = this.left
      inject    = this.right
    } else if (this.right.type === '||') {
      decompose = this.right
      inject    = this.left
    } else {
      return this
    }

    this.type  = '||'
    // (A && C)
    this.left  = inject.equalTo(decompose.left) ? inject : new Term('&&', decompose.left, inject)
    // (B && C)
    this.right = inject.equalTo(decompose.right) ? inject : new Term('&&', decompose.right, inject)

    if (isPerfect && (inject.type === '||' || decompose.left.type === '||' || decompose.right.type === '||')) {
      this.left.distributeConjunction(isPerfect)
      this.right.distributeConjunction(isPerfect)
    }
  }

  return this
}

// Conjunctive Normal Form (A || B) && (C || D)
Term.prototype.toCNF = function (isPerfect = false) {
  this.toNNF()
  this.distributeDisjunction(isPerfect)

  return this
}

// Disjunctive Normal Form (A && B) || (C && D)
Term.prototype.toDNF = function (isPerfect = false) {
  this.toNNF()
  this.distributeConjunction(isPerfect)

  return this
}

Term.prototype.equalTo = function (term) {
  if (this === term) return true
  if (this.type !== term.type) return false
  if (this.negated !== term.negated) return false
  if (this.value !== term.value) return false
  if (this.left !== null) return this.left.equalTo(term.left) && this.right.equalTo(term.right)

  return true
}

Term.prototype.toString = function () {
  return this.stringExpression(this.type)
}

Term.prototype.stringExpression = function (parentType) {
  switch (this.type) {
    case TokenType.Literal:
      if (this.typeOf === 1) return this.negated ? '-' + this.value : this.value
      if (this.typeOf === 2) return this.negated ? '!' + this.value : this.value
      if (this.typeOf === 3) return `'${this.value}'`
      if (this.typeOf === 4) return `'${this.value}'`

      return this.value
    case TokenType.Identifier:
      return (this.negated ? '!' : '') + this.value
    default:
      let str = `${this.left.stringExpression(this.type)} ${this.type} ${this.right.stringExpression(this.type)}`

      if (this.negated || this.type !== parentType) str = `(${str})`

      return (this.negated ? '!' : '') + str
  }
}

Term.prototype.toPrimitive = function () {
  switch (this.type) {
    case TokenType.Literal:
      if (this.typeOf === 1) return this.negated ? -this.value : +this.value
      if (this.typeOf === 2) return this.value === 'true' ? this.negated ? false : true : this.negated ? true : false
      if (this.typeOf === 3) return this.negated ? true : null
      if (this.typeOf === 4) {
        if (this.value === '') return this.negated ? true : `''`
        return this.negated ? false : `'${this.value}'`
      }
    case TokenType.Identifier:
      return this.negated ? '!' + this.value : this.value
    default:
      assert(true, `type "${this.type}" can't be primitive`)
  }
}

Term.prototype.execute = function (params) {
  switch (this.type) {
    case TokenType.Literal:
      if (this.typeOf === 1) return this.negated ? -parseFloat(this.value) : parseFloat(this.value)
      if (this.value === 'true') return this.negated ? false : true
      if (this.value === 'false') return this.negated ? true : false
      if (this.typeOf === 3) return this.negated ? true : null

      return `'${this.value}'`
    case TokenType.Identifier:
      return this.negated ? !params[this.value] : params[this.value]
    default: {
      const result = eval(`${this.left.execute(params)} ${this.type} ${this.left.execute(params)}`)
      return this.negated ? !result : result
    }
  }
}

Term.prototype.clone = function () {
  let term

  if (this.value !== null) {
    term = new Term(this.type, this.value)
  } else {
    term = new Term(this.type, this.left.clone(), this.right.clone())
  }

  return this.negated ? term.negate() : term
}

export const L = (value) => new Term(TokenType.Literal, value)
export const I = (value) => new Term(TokenType.Identifier, value)
export const Ex = (op, left, right) => new Term(op, left, right)