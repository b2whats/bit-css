const TokenType = {
    Identifier: 'Identifier',
    Number: 'Number',
    String: 'String',
    Boolean: 'Boolean',
    Null: 'Null',
  }
  
  const keyword = {
    'null': TokenType.Null,
    'true': TokenType.Boolean,
    'false': TokenType.Boolean,
  }
  
  const stringToCharCode = (str) => [...str].map((char) => char.charCodeAt(0))
  
  export class Tokenizer {
    source = ''
    cursor = 0
    length = 0
    charCode = 0
    keyword = new Map([
      ['null', TokenType.Null], 
      ['true', TokenType.Boolean],
      ['false', TokenType.Boolean],
    ])
  
    constructor(source) {
      this.source = source
      this.length = source.length
      this.charCode = source.charCodeAt(0)
    }
  
    next(cursor = ++this.cursor) { return this.charCode = this.source.charCodeAt(cursor) }
    peek(shift) { return this.source.charCodeAt(this.cursor + shift) }
  
    slice(start, end = this.cursor) { return this.source.slice(start, end) }
    
    isScanning() {
      return this.cursor < this.length
    }
  
    isIdentifier(charCode = this.charCode) { return (
      (charCode === 36 || charCode === 95) || // $ _
      (charCode > 64 && charCode < 91) ||     // A-Z
      (charCode > 96 && charCode < 123)       // a-z
    )}
  
    isDot(charCode = this.charCode) { return charCode === 46 }
  
    isStartNumber(charCode = this.charCode) { return (
      this.isNumber() ||
      (this.isDot() && this.isNumber(this.peek(1)))
    )}
  
    isNumber(charCode = this.charCode) { return (
      charCode > 47 && charCode < 58 // 0-9
    )}
  
    isQuote(charCode = this.charCode) { return charCode === 34 || charCode === 39 } // " '
  
    isOperator(charCode = this.charCode) { return (
      (charCode === 33) ||                     // !
      (charCode === 38) ||                     // &
      (charCode > 39 && charCode < 48) ||      // ( ) * + , - . /
      (charCode === 58) ||                     // :
      (charCode > 59 && charCode < 63) ||      // < = >
      (charCode === 91 || charCode === 93) ||  // [ ]
      (charCode > 122 && charCode < 126)       // { | }
    )}
  
    identifier() {
      const startPosition = this.cursor
    
      do this.next()
      while (this.isIdentifier() || this.isNumber())
  
      const value = this.slice(startPosition)
  
      return {
        type: keyword[value] || TokenType.Identifier,
        value
      }
    }
  
    numberLiteral() {
      const startPosition = this.cursor
    
      do this.next()
      while (this.isNumber() || this.isDot())
    
      return {
        type: TokenType.Number,
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
        type: TokenType.String,
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
      if (this.isScanning()) {
        if (this.isIdentifier()) return this.identifier()
        else if (this.isStartNumber()) return this.numberLiteral()
        else if (this.isOperator()) return this.operator()
        else if (this.isQuote()) return this.stringLiteral()
        else {
            this.next()
            return this.nextToken()
        }
      }
  
      return null
    }
  
    nextToToken(token) {
      if (this.cursor >= this.length) return null
      const startPosition = this.cursor
  
      if (token.length === 1) {
        const charCode = token.charCodeAt(0)
        
        while (this.cursor < this.length && this.charCode !== charCode) {
          this.next()
        }
  
        // if (this.cursor >= this.length) {
        //   throw Error(`Token '${token}' was not found in '${this.slice(startPosition)}'`)
        // }
  
        return {
          type: TokenType.String,
          value: this.slice(startPosition)
        }
      } else {
        const sequense = stringToCharCode(token)
        let index = 0
        let currentChar = sequense[index]
  
        do {
          if (this.charCode !== currentChar) {
            if (index !== 0) {
              index = 0
              currentChar = sequense[index]
            }
            this.next()
          } else {
            index += 1
            if (index === token.length) {
              if (!this.isIdentifier(this.peek(1)) && !this.isIdentifier(this.peek(-token.length))) {
                this.next()
                return [{
                  type: TokenType.String,
                  value: this.slice(startPosition, this.cursor-token.length)
                }, {
                  type: TokenType.Identifier,
                  value: token
                }]
              } else {
                index = 0
                currentChar = sequense[index]
                this.next()
              }
            }
            currentChar = sequense[index]
            this.next()
          }
        } while (this.cursor < this.length)
  
        return [{
          type: TokenType.String,
          value: this.slice(startPosition)
        }]
  
      }
    }
  
    tokens() {
      const result = []
      let next
  
      while (next = this.nextToken()) result.push(next)
  
      return result
    }
  }
