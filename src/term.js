import { TokenType } from './scanner'

const oppositeOperators = new Map([
  [ "||", '&&' ],
  [ "&&", '||' ],
  [ "==", '!=' ],
  [ "!=", '==' ],
  [ "<",  '>=' ],
  [ ">",  '<=' ],
  [ "<=", '>'  ],
  [ ">=", '<'  ],
])

const assert = (cond, message) => { if (cond) throw new SyntaxError(message) }

export function Term(type, left, right) {
  this.type = type
  this.negated = false
  this.left = null
  this.right = null
  this.value = null
  this.commonType = false

  switch (type) {
    case TokenType.Identifier: {
      this.value = left

      return this
    }
    case TokenType.Literal: {
      if (/^Boolean|Function|String|Number/.exec(left) !== null) {
        this.commonType = true
        this.value = left
        
        return this
      }
      this.value = left
      if (/^true|false|null|-?\d|'/.exec(this.value) === null) this.value = `'${this.value}'`

      return this
    }
    case '==':
      if (right.commonType && right.negated) { this.type = '!='; right.negated = false }
    case '!=':
      if (right.commonType && right.negated) { this.type = '=='; right.negated = false }
    case '>':
    case '<':
    case '>=':
    case '<=':
      assert(left.type !== TokenType.Identifier, `Left side "${left}" of the expression "${left} ${type} ${right}"  must be an identifier`)
      assert(left.negated, `Left side "${left}" of the expression "${left} ${type} ${right}" mustn't be negated`)
      assert(right.type !== TokenType.Literal && right.type !== TokenType.Identifier, `Right side "${right}" of the expression "${left} ${type} ${right}"  must be a literal or identifier`)
      assert(type !== '==' && type !== '!=' && right.commonType, `Object or primitive type cannot be used in expression "${left} ${type} ${right}"`)

      this.left  = left
      this.right = right
      break
    case '||': {
      assert(left.commonType || right.commonType, `Object or primitive type cannot be used in expression "${left} ${type} ${right}"`)
      const leftBool = left.toBoolean()
      const rightBool = right.toBoolean()
      // TruthyTerm || TruthyTerm -> true
      if (leftBool === true || rightBool === true) {
        return new Term(TokenType.Literal, 'true')
      }
      // FalsyTerm || FalsyTerm -> false
      if (leftBool === false && rightBool === false) {
        return new Term(TokenType.Literal, 'false')
      }
      // X || FalsyTerm -> X
      if (left.type === TokenType.Identifier && rightBool === false) {
        return left
      }
      // FalsyTerm && X -> X
      if (right.type === TokenType.Identifier && leftBool === false) {
        return right
      }
      this.left  = left
      this.right = right
      break
    }

    case '&&': {
      assert(left.commonType || right.commonType, `Object or primitive type cannot be used in expression "${left} ${type} ${right}"`)
      const leftBool = left.toBoolean()
      const rightBool = right.toBoolean()
      // X && FalsyTerm -> false
      // FalsyTerm && X -> false
      if (leftBool === false || rightBool === false) {
        return new Term(TokenType.Literal, 'false')
      }
      // TruthyTerm && TruthyTerm -> true
      if (leftBool === true && rightBool === true) {
        return new Term(TokenType.Literal, 'true')
      }
      // X && TruthyTerm -> X
      if (left.type === TokenType.Identifier && rightBool) {
        return left
      }
      // TruthyTerm && X -> X
      if (right.type === TokenType.Identifier && leftBool) {
        return right
      }

      this.left  = left
      this.right = right
      break
    }
    default: {
      throw new SyntaxError(`Unexpected type of Term "${type}"`)
    }
  }
}

Term.prototype.negate = function () {
  if (this.type === TokenType.Literal) {
    if (/^false|null|''|0$/.exec(this.value) !== null) { this.value = 'true'; return this }
    if (/^true|-?\d|'/.exec(this.value) !== null) { this.value = 'false'; return this }
    this.negated = !this.negated
  } else {
    this.negated = !this.negated
  }

  return this
}

Term.prototype.hasChildren = function () {
  return this.left !== null
}

Term.prototype.deMorgen = function () {
  if (this.hasChildren()) {
    this.negate()
    this.type = oppositeOperators.get(this.type)

    if (this.type === '&&' || this.type === '||') {
      this.left.negate()
      this.right.negate()
    }
  }

  return this
}

// !(A || (B && C)) -> !A && !B || !C
// !(A || (B > 1)) -> !A && (B <= 1)
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

Term.prototype.toString = function (visitor) {
  return this.stringExpression(this.type, visitor)
}

Term.prototype.stringExpression = function (parentType, visitor) {
  if (visitor) visitor(this)

  switch (this.type) {
    case TokenType.Literal:
    case TokenType.Identifier: return this.negated ? `!${this.value}` : this.value
    default:
      let str = `${this.left.stringExpression(this.type, visitor)}${this.type}${this.right.stringExpression(this.type, visitor)}`

      if (this.negated || (this.type !== parentType && (this.type === '||'))) str = `(${str})`

      return this.negated ? `!${str}` : str
  }
}

Term.prototype.toBoolean = function () {
  if (this.type === TokenType.Literal) {
    let value = true

    if(this.value === `''` || this.value === '0' || this.value === 'null' || this.value === 'false') value = false
  
    return value
  }

  return null
}

Term.prototype.execute = function (params) {
  switch (this.type) {
    case TokenType.Literal:
      return this.stringExpression(null)
    case TokenType.Identifier:
      return this.negated ? !params[this.value] : params[this.value]
    default: {
      let left = this.left.execute(params)
      let right = this.right.execute(params)
      let type = this.type === '==' || this.type === '!=' ? this.type + '=' : this.type

      if (this.right.commonType) {
        left = `typeof ${left}`
        right = `'${right.toLowerCase()}'`
      }

      const result = eval(`${left} ${type} ${right}`)

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