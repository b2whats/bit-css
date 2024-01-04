export const loop = (cases, test) => {
  for (let index = 0; index < cases.length; index++) {
    const line = cases[index]
    if (line.length === 1) {
      console.log(`%c${line[0]}`, 'font: bold 14px Helvetica')
      continue
    }

    let [pass, result, expected] = test(line[0], line[1], line[2])

    if (pass) {
      console.log(`%c${line[0]}%c -> %c${result}`, 'color: blue', '', 'color: green')
    } else {
      console.log(`%c${line[0]}%c result: %c${result}%c expected: ${expected}`, 'color: blue', '', 'color: red', '')
    }
  }
}