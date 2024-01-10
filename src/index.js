import { Tokenizer } from "./tokenizer"

const tokens2 = new Tokenizer('veevee)ffff(d')
console.log('tokens2', tokens2.nextTo(')'))
console.log('tokens22', tokens2.nextTo('('))