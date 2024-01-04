import { Tokenizer } from "./tokenizer"

const tokens2 = new Tokenizer('veevee)ffff(d')
console.log('tokens2', tokens2.nextToToken(')'))
console.log('tokens22', tokens2.nextToToken('('))