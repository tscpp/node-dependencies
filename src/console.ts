import * as vscode from 'vscode';
import { Writable } from 'stream';

export class Console {
	public static output: vscode.OutputChannel | undefined;

	constructor() {
		Console.output?.show();
	}

	pipe = new Writable({
		defaultEncoding: 'utf-8',
		write: (...args) => (function (this: Console, chunk: any, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void): void {
			try {
				this.write(new Buffer(chunk, encoding).toString());
			} catch (err) {
				return callback(err);
			} finally {
				callback();
			}
		}).call(this, ...args)
	});

	write(value: string) {
		Console.output?.append(value);
	}

	log(value: string) {
		Console.output?.appendLine(value);
	}

	error(value: string) {
		Console.output?.appendLine(`\x1b[31m${value}\x1b[0m`);
	}

	clear() {
		Console.output?.clear();
	}
}

export default new Console;
