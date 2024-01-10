export class Scheme {
  variables = {
    // x: {
    //   boolean: true,
    //   EQ: new Set(),
    //   NE: new Set(),
    // }
  }
  declarations = {}

  addDeclaration(name, value) {
    this.declarations[name] = value
  }

  addListRule(name, type, value) {
    if (this.variables[name] === undefined) {
      this.variables[name] = {}
    }

    if (this.variables[name][type] === undefined) {
      this.variables[name][type] = new Set()
    }

    this.variables[name][type].add(value)
  }
}