export const TokenType = {
  Identifier: 'Identifier',
  Literal: 'Literal',
}

const operators = ['!', '&&', '||', '(', ')', '{', '}', '[', ']', ':', ',', ';', '-', '.', '=', '!=', '>', '>=', '<', '<=']
const operatorsCharCode = operators.reduce((acc, curr) => {
  if (curr.length === 1) { acc.add(curr.charCodeAt()) }
  if (curr.length === 2) { acc.add(curr[0].charCodeAt()); acc.add(curr[1].charCodeAt()) }

  return acc
}, new Set())

const generateCharCodeKeys = () => {
  const buffer = new Uint8Array(127)

  for (let i = 0; i < 128; i++) {
    if (i >= 65 && i <= 90) buffer[i] = 1 // A-Z
    else if (i >= 97 && i <= 122) buffer[i] = 1 // a-z
    else if (i === 36 || i === 95) buffer[i] = 1 // $_
    else if (i >= 48 && i <= 57) buffer[i] = 2 // 0-9
    else if (operatorsCharCode.has(i)) buffer[i] = 3
    else if (i === 34 || i === 39) buffer[i] = 4 // " '
  }

  return buffer
}

const charCodeKeys = generateCharCodeKeys()
  
export class Scanner {
  static textEncoder = new TextEncoder()

  source = ''
  cursor = 0
  length = 0
  charCode = 0
  primitive = /true|false|null/
  buffer = new Uint8Array(0)
  charCodeKeys = charCodeKeys

  constructor() {}

  init(source) {
    this.cursor = 0
    this.source = source
    this.length = source.length

    if (this.buffer.byteLength < this.length) {
      this.buffer = new Uint8Array(this.length)
    }
    Scanner.textEncoder.encodeInto(this.source, this.buffer)

    this.charCode = this.buffer[0]
  }

  next(cursor = ++this.cursor) { return this.charCode = this.buffer[cursor] }
  peek(shift) { return this.buffer[this.cursor + shift] }

  slice(start, end = this.cursor) { return this.source.slice(start, end) }
  
  isScanning() { return this.cursor < this.length }

  isIdentifier(charCode = this.charCode) { return this.charCodeKeys[charCode] === 1 }

  isNumber(charCode = this.charCode) { return this.charCodeKeys[charCode] === 2 }

  isOperator(charCode = this.charCode) { return this.charCodeKeys[charCode] === 3 }
  
  isQuote(charCode = this.charCode) { return this.charCodeKeys[charCode] === 4 }

  isDot(charCode = this.charCode) { return charCode === 46 }

  identifier() {
    const startPosition = this.cursor
  
    do this.next()
    while (this.isIdentifier() || this.isNumber())

    const value = this.slice(startPosition)

    return {
      type: this.primitive.exec(value) !== null ? TokenType.Literal : TokenType.Identifier,
      value
    }
  }

  numberLiteral() {
    const startPosition = this.cursor
  
    do this.next()
    while (this.isNumber() || this.isDot())
  
    return {
      type: TokenType.Literal,
      value: this.slice(startPosition)
    }
  }

  stringLiteral() {
    const startPosition = this.cursor
    const quote = this.charCode
  
    do this.next()
    while (this.charCode !== quote)
  
    this.next()
  
    return {
      type: TokenType.Literal,
      value: this.slice(startPosition + 1, this.cursor - 1)
    }
  }

  operator() {
    const startPosition = this.cursor
    const nextCharCode = this.peek(1)
    let value 
  
    if (nextCharCode === this.charCode &&  
      (this.charCode === 38 || this.charCode === 61 || this.charCode === 124)
    ) { // && || ==
      this.cursor++
      value = this.source[startPosition] + this.source[startPosition]
    } else if (nextCharCode === 61 &&
      (this.charCode === 60 || this.charCode === 62 || this.charCode === 33)
    ) { // <= >= !=
      this.cursor++
      value = this.source[startPosition] + this.source[startPosition + 1]
    } else {
      value = this.source[startPosition]
    }

    this.next()
  
    return { type: value, value }
  }


  nextToken() {
    while(this.isScanning()) {
      switch (this.charCodeKeys[this.charCode]) {
        case 1: return this.identifier()
        case 2: return this.numberLiteral()
        case 3: return this.operator()
        case 4: return this.stringLiteral()
        default: this.next()
      }
    }

    return null
  }

  nextToToken(token) {
    if (!this.isScanning()) return null
    
    const re = new RegExp(token.replace(/[.*+?^${}()[\]\\]/g, "\\$&"), 'g')
    const startPosition = re.lastIndex = this.cursor

    const search = re.exec(this.source)

    if (search !== null) {
      this.cursor = search.index + search[0].length - 1
      this.next()

      return [ this.slice(startPosition, search.index), search[0] ]
    } else {
      this.cursor = this.length

      return [ this.slice(startPosition, this.cursor), null ]
    }
  }

  tokens() {
    const result = []
    let next

    while (next = this.nextToken()) result.push(next)

    return result
  }
}
