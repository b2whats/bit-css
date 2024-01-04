import { TokenType } from './scanner'

const operators = new Map([
  [ "||", ['&&', '⋁'] ],
  [ "&&", ['||', '∧'] ],
  [ "==", ['!=', '≡'] ],
  [ "!=", ['==', '≠'] ],
  [ "<",  ['>=', '⋖'] ],
  [ ">",  ['<=', '⋗'] ],
  [ "<=", ['>',  '⋜'] ],
  [ ">=", ['<',  '⋝'] ],
  [ "-",  ['-',  '-'] ],
  [ "!",  ['!',  '¬'] ],
])

export function Term(type, left, right) {
  this.type = type
  this.negated = false
  this.left = null
  this.right = null
  this.value = null
  this.parent = null

  // TODO: Проверка при создании выражений X .. number что левая часть это identifier а правая число
  switch (type) {
    case '==':
      // A == true -> A 
      // A == false -> !A
      if (left.type === TokenType.Identifier && right.value === 'true') {
        this.type = TokenType.Identifier
        this.value = left.value
        break
      } else if (left.type === TokenType.Identifier && right.value === 'false') {
        this.type = TokenType.Identifier
        this.value = left.value
        this.negated = true
        break
      }
    case '!=':
      // A != true -> !A 
      // A != false -> A
      if (left.type === TokenType.Identifier && right.value === 'false') {
        this.type = TokenType.Identifier
        this.value = left.value
        break
      } else if (left.type === TokenType.Identifier && right.value === 'true') {
        this.type = TokenType.Identifier
        this.value = left.value
        this.negated = true
        break
      }
    case '&&':
    case '||':
    case '>':
    case '<':
    case '>=':
    case '<=':
      this.left  = left
      this.right = right
      left.parent = this
      right.parent = this
      break
    case TokenType.Identifier:
    case TokenType.Literal:
      this.value = left
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

Term.prototype.oppositeType = function () {
  return operators.get(this.type)[0]
}

Term.prototype.deMorgen = function () {
  if (this.hasChildren()) {
    this.negate()
    this.type = this.oppositeType()

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

    if (isPerfect && inject.type === '&&') {
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

    if (isPerfect && inject.type === '||') {
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

Term.prototype.traverse = function (terms, parentType = this.type, isRight = false) {
  switch (this.type) {
    case Token.LITERAL:
    case TokenType.Identifier:
      terms[this.type](parentType, this.value, this.negated, isRight)
      break
    default:
      terms.operators(parentType, this.type, this.left, this.right, this.negated, isRight)

      break
  }
}

Term.prototype.toCustomPropertyValue = function () {
  return this.stringCustomPropertyExpression(this.type)
}

Term.prototype.stringExpression = function (parentType) {
  switch (this.type) {
    case TokenType.Literal:
      let prefix = ''

      if (this.negated) {
        if (/^\d/.exec(this.value) !== null) prefix = operators.get('-')[1]
        else if (/^(true|false)/.exec(this.value) !== null) prefix = operators.get('!')[1]
      }

      return `${prefix}${this.value}`
    case TokenType.Identifier:
      return (this.negated ? operators.get('!')[1] : '') + this.value
    default:
      let str = `${this.left.stringExpression(this.type)} ${operators.get(this.type)[1]} ${this.right.stringExpression(this.type)}`

      if (this.negated || this.type !== parentType) str = `(${str})`

      return (this.negated ? operators.get('!')[1] : '') + str
  }
}

Term.prototype.execute = function (params) {
  switch (this.type) {
    case TokenType.Literal:
      if (/^\d/.exec(this.value) !== null) return this.negated ? -parseFloat(this.value) : parseFloat(this.value)
      
      if (this.value === 'true') return this.negated ? false : true
      if (this.value === 'false') return this.negated ? true : false
      if (this.value === 'null') return this.negated ? true : null

      return this.value
    case TokenType.Identifier:
      return this.negated ? !params[this.value] : params[this.value]
    default: {
      const result = eval(`${this.left.execute(params)} ${this.type} ${this.left.execute(params)}`)
      return this.negated ? !result : result
    }
  }
}

Term.prototype.stringExpression = function (parentType) {
  switch (this.type) {
    case TokenType.Literal:
      let prefix = ''

      if (this.negated) {
        if (/^\d/.exec(this.value) !== null) prefix = operators.get('-')[1]
        else if (/^(true|false)/.exec(this.value) !== null) prefix = operators.get('!')[1]
      }

      return `${prefix}${this.value}`
    case TokenType.Identifier:
      return (this.negated ? operators.get('!')[1] : '') + this.value
    default:
      let str = `${this.left.stringExpression(this.type)} ${operators.get(this.type)[1]} ${this.right.stringExpression(this.type)}`

      if (this.negated || this.type !== parentType) str = `(${str})`

      return (this.negated ? operators.get('!')[1] : '') + str
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
};


Term.prototype.stringCustomPropertyExpression = function (parentType, isRight = false) {
  var str

  switch (this.type) {
    case Token.LITERAL:
      str = `${this.negated ? '-' : ''}${this.value}`
      break
    case TokenType.Identifier:
      str = `${this.negated ? 'not-' : ''}${this.value}`
      str = parentType === '||' ? `var(--${str})` :
            parentType === '&&' ? `var(--${str}${isRight ? ')': ''}` :
            str
      break
    case '&&':
      str =
        this.left.stringCustomPropertyExpression(this.type) +
        ',' +
        this.right.stringCustomPropertyExpression(this.type, true) + ')'
      break
    case '||':
      str =
        this.left.stringCustomPropertyExpression(this.type) +
        ' ' +
        this.right.stringCustomPropertyExpression(this.type, true)
      break
    default:
      str =
        this.left.stringCustomPropertyExpression(this.type) +
        Token[this.type][2] +
        this.right.stringCustomPropertyExpression(this.type, true)
      str = `var(--${str})`
      break
  }

  return str
}

export const Literal = (value) => new Term(TokenType.Literal, value)
export const Identifier = (value) => new Term(TokenType.Identifier, value)
export const Ex = (op, left, right) => new Term(op, left, right)