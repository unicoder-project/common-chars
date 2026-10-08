import { iterateReader, type Reader } from '@std/io'
import { unescape } from '@std/html'
import wtf from 'wtf_wikipedia'
import * as z from 'zod'

const EXIT_CODE = {
	Ok: 0x0,
	Continue: 0xC0,
} as const

const Output = z.object({
	bytesRead: z.number(),
	frequencies: z.record(z.string(), z.number()),
})

const filePath = './data/enwiki-2026-10-01-p10p1113635.xml'
const outputFilePath = './out/output.json'

const info = await Deno.stat(filePath)
const fileHandle = await Deno.open(filePath)

function utf8ByteLength(str: string) {
	return new TextEncoder().encode(str).length
}

class Progress {
	constructor(bytesRead: number) {
		this.#bytesRead = bytesRead
	}

	#bytesRead: number
	get bytesRead() {
		return this.#bytesRead
	}
	#buf = ''
	get buf() {
		return this.#buf
	}

	append(chunk: string) {
		this.#buf += chunk
	}

	advance(numCodeUnits: number) {
		const newBuf = this.#buf.slice(numCodeUnits)
		this.#bytesRead += utf8ByteLength(this.#buf) - utf8ByteLength(newBuf)
		this.#buf = newBuf
	}
}

const td = new TextDecoder()

async function init(): Promise<{
	progress: Progress
	frequencies: Map<string, number>
}> {
	try {
		const f = Output.parse(JSON.parse(await Deno.readTextFile(outputFilePath)))

		return {
			progress: new Progress(f.bytesRead),
			frequencies: new Map(Object.entries(f.frequencies)),
		}
	} catch (e) {
		// deno-lint-ignore no-console
		console.error(e)

		return {
			progress: new Progress(0),
			frequencies: new Map(),
		}
	}
}

const { progress, frequencies } = await init()

// deno-lint-ignore no-console
console.info(`Seeking ${progress.bytesRead.toLocaleString('en-GB')} bytes`)
await fileHandle.seek(progress.bytesRead, Deno.SeekMode.Start)

async function* getTextChunks(reader: Reader): AsyncGenerator<{ text: string; index: number }, undefined, undefined> {
	let index = 0
	const result = (text: string) => ({ text, index: index++ })

	for await (const chunk of iterateReader(reader)) {
		yield result(td.decode(chunk, { stream: true }))
	}

	yield result(td.decode())
}

for await (const { text, index } of getTextChunks(fileHandle)) {
	progress.append(text)

	const m = /<text[^>]*>([\s\S]*?)<\/text>/i.exec(progress.buf)
	if (m != null) {
		const inner = wtf(unescape(m[1])).text().trim()

		for (const char of inner) {
			frequencies.set(char, (frequencies.get(char) ?? 0) + 1)
		}

		progress.advance(m.index + m[0].length)
	} else if (!/<text|<tex$|<te$|<t$|<$/i.test(progress.buf)) {
		progress.advance(Infinity)
	}

	const pct = (progress.bytesRead / info.size).toLocaleString('en-GB', {
		minimumFractionDigits: 3,
		maximumFractionDigits: 3,
		style: 'percent',
	})

	const gloss = `\r${pct.padStart(9)} [${index}]`
	await Deno.stdout.write(new TextEncoder().encode(gloss))

	if (index && (index % 0x100 === 0)) {
		await write()
		// deno-lint-ignore no-console
		console.info('')
		Deno.exit(EXIT_CODE.Continue)
	}
}

Deno.exit(EXIT_CODE.Ok)

async function write() {
	const outEntries = [...frequencies.entries()].sort(([, a], [, b]) => b - a)
	const outRows = outEntries.map(([char, freq]) => `\t\t${JSON.stringify(char)}: ${freq}`)
	const outFreq = `{\n${outRows.join(',\n')}\n\t}`

	const outJson = `{\n\t"bytesRead": ${progress.bytesRead},\n\t"frequencies": ${outFreq}\n}\n`

	await Deno.writeTextFile(outputFilePath, outJson)
}
