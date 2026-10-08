import { EXIT_CODE } from './consts.ts'

programLoop: while (true) {
	const proc = new Deno.Command(Deno.execPath(), {
		args: ['run', '-A', 'main.ts'],
	}).spawn()

	const output = await proc.output()

	// console.log({code: output.code})

	switch (output.code) {
		case EXIT_CODE.Ok: {
			break programLoop
		}
		case EXIT_CODE.Continue: {
			break
		}
		default: {
			throw new Error(`Unexpected exit code: ${output.code}`)
		}
	}
}
