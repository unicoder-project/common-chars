while (true) {
	const proc = new Deno.Command(Deno.execPath(), {
		args: ['run', '-A', 'main.ts'],
	}).spawn()

	const output = await proc.output()

	if (output.code === 0) break
}
