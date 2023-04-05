var memory = new Uint8Array(256);
var stack = new Uint8Array(16);
var program_counter = new Uint8Array(1);
var stack_pointer: number = 0;
var accumulator = new Uint8Array(1);
var carry_flag: boolean = false;
var zero_flag: boolean = false;
var source_address: number = 0;
var running: boolean = true;
var speed: number = 1;
const input = document.getElementById("input") as HTMLInputElement;
const output = document.getElementById("output") as HTMLInputElement;
const memory_view = document.getElementById("memory") as HTMLTableElement;
const registers = document.getElementById("registers") as HTMLTableElement;
const stack_view = document.getElementById("stack") as HTMLTableElement;
const program = document.getElementById("program") as HTMLInputElement;
const current_instruction = document.getElementById("current_instruction") as HTMLInputElement;
const labels_view = document.getElementById("labels") as HTMLInputElement;
var label_addresses: Record<number, string> = {};

var g_wasm: any | null = null;
fetch("customasm.wasm")
	.then(r => r.arrayBuffer())
	.then(r => WebAssembly.instantiate(r))
	.then(wasm =>
	{
		g_wasm = wasm
	})

function sleep(ms: number)
{
	return new Promise(resolve => setTimeout(resolve, ms));
}

function update()
{
	if(memory[program_counter[0]] >> 2 <= 0x19 && memory[program_counter[0]] >> 2)
	{
		current_instruction.innerHTML = "<b>Current instruction:</b> " + ["ld", "st", "add", "sub", "adc", "sbc", "and", "or", "xor", "shl", "shr", "rol", "ror", "cmp", "tst", "jmp", "jz", "jnz", "jc", "jnc", "call", "ret", "in", "out", "hlt"][(memory[program_counter[0]] >> 2) - 1] + " ";
		switch(memory[program_counter[0]] & 3)
		{
			case 0:
				// immediate
				if([2, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15].includes(memory[program_counter[0]] >> 2))
				{
					source_address = memory[program_counter[0] + 1];
					if(Object.keys(label_addresses).includes(memory[program_counter[0] + 1].toString(10)))
					{
						current_instruction.innerHTML += label_addresses[memory[program_counter[0] + 1]];
					}
					else
					{
						current_instruction.innerHTML += "0x" + source_address.toString(16).padStart(2, "0").toUpperCase();
					}
				}
				else
				{
					source_address = program_counter[0] + 1;
					current_instruction.innerHTML += "#0x" + memory[program_counter[0] + 1].toString(16).padStart(2, "0").toUpperCase();
				}
				break;
			case 1:
				// direct
				if([2, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15].includes(memory[program_counter[0]] >> 2))
				{
					source_address = memory[memory[program_counter[0] + 1]];
					if(Object.keys(label_addresses).includes(memory[program_counter[0] + 1].toString(10)))
					{
						current_instruction.innerHTML += "[" + label_addresses[memory[program_counter[0] + 1]] + "]";
					}
					else
					{
						current_instruction.innerHTML += "[0x" + memory[program_counter[0] + 1].toString(16).padStart(2, "0").toUpperCase() + "]";
					}
				}
				else
				{
					source_address = memory[program_counter[0] + 1];
					if(Object.keys(label_addresses).includes(memory[program_counter[0] + 1].toString(10)))
					{
						current_instruction.innerHTML += label_addresses[memory[program_counter[0] + 1]];
					}
					else
					{
						current_instruction.innerHTML += "0x" + source_address.toString(16).padStart(2, "0").toUpperCase();
					}
				}
				break;
			case 2:
				// indirect
				source_address = memory[memory[program_counter[0] + 1]];
				if(Object.keys(label_addresses).includes(memory[program_counter[0] + 1].toString(10)))
				{
					current_instruction.innerHTML += "[" + label_addresses[memory[program_counter[0] + 1]] + "]";
				}
				else
				{
					current_instruction.innerHTML += "[0x" + memory[program_counter[0] + 1].toString(16).padStart(2, "0").toUpperCase() + "]";
				}
				break;
			default:
				source_address = program_counter[0];
				break;
		}
	}
	else
	{
		source_address = program_counter[0];
		current_instruction.innerHTML = "<b>Current instruction:</b> hlt";
	}
    for(let row = 1; row < 17; row++)
    {
		for(let column = 1; column < 17; column++)
        	{
			memory_view.rows[row].cells[column].innerHTML = memory[(row - 1) * 16 + column - 1].toString(16).padStart(2, "0").toUpperCase();
			if((row - 1) * 16 + column - 1 == source_address)
            		{
				memory_view.rows[row].cells[column].innerHTML = "<span class='label label-secondary'>" + memory[(row - 1) * 16 + column - 1].toString(16).padStart(2, "0").toUpperCase() + "</span>";
			}
			if((row - 1) * 16 + column - 1 == program_counter[0])
            		{
				memory_view.rows[row].cells[column].innerHTML = "<span class='label label-primary'>" + memory[(row - 1) * 16 + column - 1].toString(16).padStart(2, "0").toUpperCase() + "</span>";
			}
		}
	}
	registers.rows[1].cells[0].innerHTML = program_counter[0].toString(16).padStart(2, "0").toUpperCase();
	registers.rows[1].cells[1].innerHTML = stack_pointer.toString(16).toUpperCase();
	registers.rows[1].cells[2].innerHTML = accumulator[0].toString(16).padStart(2, "0").toUpperCase();
	registers.rows[1].cells[3].innerHTML = (+carry_flag).toString();
	registers.rows[1].cells[4].innerHTML = (+zero_flag).toString();
	for(let column = 0; column < 16; column++)
    	{
		stack_view.rows[1].cells[column].innerHTML = stack[column].toString(16).padStart(2, "0").toUpperCase();
		if(column == stack_pointer)
        	{
			stack_view.rows[1].cells[column].innerHTML = "<span class='label label-primary'>" + stack[column].toString(16).padStart(2, "0").toUpperCase() + "</span>";
		}
	}
}

function step()
{
	running = true;
	let source: number = 0;
	let tmp: number = 0;
	switch(memory[program_counter[0]] & 3)
	{
		case 0:
			// immediate
			source_address = program_counter[0] + 1;
			break;
		case 1:
			// direct
			source_address = memory[program_counter[0] + 1];
			break;
		case 2:
			// indirect
			source_address = memory[memory[program_counter[0] + 1]];
			break;
		default:
			source_address = program_counter[0];
			break;
	}
	source = memory[source_address];
	switch(memory[program_counter[0]++] >> 2)
	{
		case 1:
			// load
			accumulator[0] = source;
			program_counter[0]++;
			break;
		case 2:
			// store
			memory[source] = accumulator[0];
			program_counter[0]++;
			break;
		case 3:
			// add
			carry_flag = accumulator[0] + source > 255;
			accumulator[0] += source;
			zero_flag = !accumulator[0];
			program_counter[0]++;
			break;
		case 4:
			// subtract
			carry_flag = accumulator[0] - source < 0;
			accumulator[0] -= source;
			zero_flag = !accumulator[0];
			program_counter[0]++;
			break;
		case 5:
			// add with carry
			tmp = +carry_flag;
			carry_flag = accumulator[0] + source + tmp > 255;
			accumulator[0] += source + tmp;
			zero_flag = !accumulator[0];
			program_counter[0]++;
			break;
		case 6:
			// subtract with carry
			tmp = +carry_flag;
			carry_flag = accumulator[0] - source - tmp < 0;
			accumulator[0] -= source + tmp;
			zero_flag = !accumulator[0];
			program_counter[0]++;
			break;
		case 7:
			// and
			accumulator[0] &= source;
			zero_flag = !accumulator[0];
			program_counter[0]++;
			break;
		case 8:
			// or
			accumulator[0] |= source;
			zero_flag = !accumulator[0];
			program_counter[0]++;
			break;
		case 9:
			// exclusive or
			accumulator[0] ^= source;
			zero_flag = !accumulator[0];
			program_counter[0]++;
			break;
		case 0xa:
			// shift left
			carry_flag = (accumulator[0] & 128) >> 7 ? true : false;
			accumulator[0] <<= 1;
			zero_flag = !accumulator[0];
			break;
		case 0xb:
			// shift right
			carry_flag = accumulator[0] & 1 ? true : false;
			accumulator[0] >>= 1;
			zero_flag = !accumulator[0];
			break;
		case 0xc:
			// rotate left
			tmp = +carry_flag;
			carry_flag = (accumulator[0] & 128) >> 7 ? true : false;
			accumulator[0] = (accumulator[0] << 1) + tmp;
			zero_flag = !accumulator[0];
			break;
		case 0xd:
			// rotate right
			tmp = +carry_flag;
			carry_flag = accumulator[0] & 1 ? true : false;
			accumulator[0] = (accumulator[0] >> 1) + (tmp << 7);
			zero_flag = !accumulator[0];
			break;
		case 0xe:
			// compare
			carry_flag = accumulator[0] - source < 0;
			zero_flag = !(accumulator[0] - source);
			program_counter[0]++;
			break;
		case 0xf:
			// test
			zero_flag = !(accumulator[0] & source);
			program_counter[0]++;
			break;
		case 0x10:
			// jump
			program_counter[0] = source;
			break;
		case 0x11:
			// jump if zero
			program_counter[0] = zero_flag ? source : program_counter[0] + 1;
			break;
		case 0x12:
			// jump if not zero
			program_counter[0] = !zero_flag ? source : program_counter[0] + 1;
			break;
		case 0x13:
			// jump if carry
			program_counter[0] = carry_flag ? source : program_counter[0] + 1;
			break;
		case 0x14:
			// jump if not carry
			program_counter[0] = !carry_flag ? source : program_counter[0] + 1;
			break;
		case 0x15:
			// call
			stack[stack_pointer++] = program_counter[0] + 1;
			if(stack_pointer > 15)
			{
				output.innerHTML += "Stack overflow. Halted at 0x" + (program_counter[0] - 1).toString(16).padStart(2, "0").toUpperCase() + ".";
				running = false;
			}
			else
			{
				stack_pointer %= 16;
				program_counter[0] = source;
			}
			break;
		case 0x16:
			// return
			stack_pointer--;
			if(stack_pointer < 0)
			{
				output.innerHTML += "Stack underflow. Halted at 0x" + (program_counter[0] - 1).toString(16).padStart(2, "0").toUpperCase() + ".";
				running = false;
			}
			else
			{
				program_counter[0] = stack[stack_pointer];	
				stack_pointer %= 16;
				stack[stack_pointer] = 0;
			}
			break;
		case 0x17:
			// input
			while(!input.value.length || input.value == "null\n")
	    		{
				input.value = prompt("Please provide input:", "") + "\n";
			}
			accumulator[0] = input.value.charCodeAt(0);
			input.value = input.value.slice(1);
			break;
		case 0x18:
			// output
			output.innerHTML += String.fromCharCode(accumulator[0]);
			output.scrollTop = output.scrollHeight;
			break;
		default:
			// halt
			output.innerHTML += "Halted at 0x" + (program_counter[0] - 1).toString(16).padStart(2, "0").toUpperCase() + ".";
			running = false;
			break;
	}
	if(running)
	{
		update();
	}
}

async function run()
{
	running = true;
	while(running)
	{
		step();
		await sleep(1000 / speed);
	}
}

function reset()
{
	memory = new Uint8Array(256);
	stack = new Uint8Array(16);
	program_counter = new Uint8Array(1);
	stack_pointer = 0;
	accumulator = new Uint8Array(1);
	carry_flag = false;
	zero_flag = false;
	running = true;
	input.value = "";
	output.innerHTML = "";
	labels_view.innerHTML = "";
	update();
}


// from https://github.com/hlorenzi/customasm/blob/main/web/main.js
function assemble()
{
	if (g_wasm == null)
		return
	
	let asmPtr = makeRustString("#subruledef args\n{\n	#{imm} => 0`2 @ imm`8\n	{dir} => 1`2 @ dir`8\n	[{ind}] => 2`2 @ ind`8\n}\n#subruledef jmp_args\n{\n	{dir} => 0`2 @ dir`8\n	[{ind}] => 1`2 @ ind`8\n}\n#ruledef\n{\n	ld {a: args} => 1`6 @ a\n	st {a: jmp_args} => 2`6 @ a\n	add {a: args} => 3`6 @ a\n	sub {a: args} => 4`6 @ a\n	adc {a: args} => 5`6 @ a\n	sbc {a: args} => 6`6 @ a\n	and {a: args} => 7`6 @ a\n	or {a: args} => 8`6 @ a\n	xor {a: args} => 9`6 @ a\n	shl => 10`6 @ 3`2\n	shr => 11`6 @ 3`2\n	rol => 12`6 @ 3`2\n	ror => 13`6 @ 3`2\n	cmp {a: args} => 14`6 @ a\n	tst {a: args} => 15`6 @ a\n	jmp {a: jmp_args} => 16`6 @ a\n	jz {a: jmp_args} => 17`6 @ a\n	jnz {a: jmp_args} => 18`6 @ a\n	jc {a: jmp_args} => 19`6 @ a\n	jnc {a: jmp_args} => 20`6 @ a\n	call {a: jmp_args} => 21`6 @ a\n	ret => 22`6 @ 3`2\n	in => 23`6 @ 3`2\n	out => 24`6 @ 3`2\n	hlt => 25`6 @ 3`2\n}\n" + program.value)
	let outputPtr = null
	try
	{
		outputPtr = g_wasm.instance.exports.wasm_assemble(4, asmPtr)
	}
	catch (e)
	{
		alert("Error assembling!\n\n" + e)
		throw e
	}

	let asm_output: string = readRustString(outputPtr)
	
	dropRustString(asmPtr)
	dropRustString(outputPtr)
	
	asm_output = asm_output.replace(/\x1b\[90m/g, "")
	asm_output = asm_output.replace(/\x1b\[91m/g, "")
	asm_output = asm_output.replace(/\x1b\[93m/g, "")
	asm_output = asm_output.replace(/\x1b\[96m/g, "")
	asm_output = asm_output.replace(/\x1b\[97m/g, "")
	asm_output = asm_output.replace(/\x1b\[1m/g, "")
	asm_output = asm_output.replace(/\x1b\[0m/g, "")
	
	if(asm_output.slice(0, 5) == "error")
	{
		output.innerHTML = asm_output;
	}
	else
	{
		reset();
		let code: RegExpMatchArray | null = asm_output.match(/.{1,2}/g);
		if(code != null)
		{
			for(let i = 0; i < code.length; i++)
			{
				memory[i] = parseInt(code[i], 16);
			}
		}

		asmPtr = makeRustString("#subruledef args\n{\n	#{imm} => 0`2 @ imm`8\n	{dir} => 1`2 @ dir`8\n	[{ind}] => 2`2 @ ind`8\n}\n#subruledef jmp_args\n{\n	{dir} => 0`2 @ dir`8\n	[{ind}] => 1`2 @ ind`8\n}\n#ruledef\n{\n	ld {a: args} => 1`6 @ a\n	st {a: jmp_args} => 2`6 @ a\n	add {a: args} => 3`6 @ a\n	sub {a: args} => 4`6 @ a\n	adc {a: args} => 5`6 @ a\n	sbc {a: args} => 6`6 @ a\n	and {a: args} => 7`6 @ a\n	or {a: args} => 8`6 @ a\n	xor {a: args} => 9`6 @ a\n	shl => 10`6 @ 3`2\n	shr => 11`6 @ 3`2\n	rol => 12`6 @ 3`2\n	ror => 13`6 @ 3`2\n	cmp {a: args} => 14`6 @ a\n	tst {a: args} => 15`6 @ a\n	jmp {a: jmp_args} => 16`6 @ a\n	jz {a: jmp_args} => 17`6 @ a\n	jnz {a: jmp_args} => 18`6 @ a\n	jc {a: jmp_args} => 19`6 @ a\n	jnc {a: jmp_args} => 20`6 @ a\n	call {a: jmp_args} => 21`6 @ a\n	ret => 22`6 @ 3`2\n	in => 23`6 @ 3`2\n	out => 24`6 @ 3`2\n	hlt => 25`6 @ 3`2\n}\n" + program.value);
		outputPtr = null
		try
		{
			outputPtr = g_wasm.instance.exports.wasm_assemble(0, asmPtr)
		}
		catch (e)
		{
			alert("Error assembling!\n\n" + e)
			throw e
		}

		asm_output = readRustString(outputPtr)
		
		dropRustString(asmPtr)
		dropRustString(outputPtr)
		
		asm_output = asm_output.replace(/\x1b\[90m/g, "")
		asm_output = asm_output.replace(/\x1b\[91m/g, "")
		asm_output = asm_output.replace(/\x1b\[93m/g, "")
		asm_output = asm_output.replace(/\x1b\[96m/g, "")
		asm_output = asm_output.replace(/\x1b\[97m/g, "")
		asm_output = asm_output.replace(/\x1b\[1m/g, "")
		asm_output = asm_output.replace(/\x1b\[0m/g, "")
		let labels: RegExpMatchArray[] | null = Array.from(asm_output.matchAll(/ +([0-9a-f]+).+; (.+):/g));
		labels_view.innerHTML = "";
		label_addresses = {};
		if(labels != null)
		{
			for(let i = 0; i < labels.length; i++)
			{
				labels_view.innerHTML += "<tr><td>" + labels[i][2] + "</td><td>0x" + labels[i][1].padStart(2, "0").toUpperCase() + "</td></tr>";
				label_addresses[parseInt(labels[i][1], 16)] = labels[i][2];
			}
		}
		update();
	}
}

function makeRustString(str: string)
{
	//console.log("makeRustString")
	//console.log(str)
	
	let bytes = window.TextEncoder ? new TextEncoder().encode(str) : stringToUtf8ByteArray(str)
	//console.log(bytes)
	
	let ptr = g_wasm.instance.exports.wasm_string_new(bytes.length)
	
	for (let i = 0; i < bytes.length; i++)
		g_wasm.instance.exports.wasm_string_set_byte(ptr, i, bytes[i])
	
	//console.log(ptr)
	return ptr
}


function readRustString(ptr: any)
{
	//console.log("readRustString")
	//console.log(ptr)
	
	let len = g_wasm.instance.exports.wasm_string_get_len(ptr)
	//console.log(len)
	
	let bytes = []
	for (let i = 0; i < len; i++)
		bytes.push(g_wasm.instance.exports.wasm_string_get_byte(ptr, i))
	
	//console.log(bytes)
	
	let str = window.TextDecoder ? new TextDecoder("utf-8").decode(new Uint8Array(bytes)) : utf8ByteArrayToString(bytes)
	//console.log(str)
	return str
}


function dropRustString(ptr: any)
{
	//console.log("dropRustString")
	//console.log(ptr)
	
	g_wasm.instance.exports.wasm_string_drop(ptr)
}

function stringToUtf8ByteArray(str: string)
{
	let out = [], p = 0
	for (let i = 0; i < str.length; i++) {
		let c = str.charCodeAt(i)
		if (c < 128) {
			out[p++] = c
		} else if (c < 2048) {
			out[p++] = (c >> 6) | 192
			out[p++] = (c & 63) | 128
		} else if (
			((c & 0xFC00) == 0xD800) && (i + 1) < str.length &&
			((str.charCodeAt(i + 1) & 0xFC00) == 0xDC00)) {
			// Surrogate Pair
			c = 0x10000 + ((c & 0x03FF) << 10) + (str.charCodeAt(++i) & 0x03FF)
			out[p++] = (c >> 18) | 240
			out[p++] = ((c >> 12) & 63) | 128
			out[p++] = ((c >> 6) & 63) | 128
			out[p++] = (c & 63) | 128
		} else {
			out[p++] = (c >> 12) | 224
			out[p++] = ((c >> 6) & 63) | 128
			out[p++] = (c & 63) | 128
		}
	}
	return out
}


// From https://github.com/google/closure-library/blob/e877b1eac410c0d842bcda118689759512e0e26f/closure/goog/crypt/crypt.js#L149
function utf8ByteArrayToString(bytes: string | any[])
{
	let out = [], pos = 0, c = 0
	while (pos < bytes.length) {
		let c1 = bytes[pos++]
		if (c1 < 128) {
			out[c++] = String.fromCharCode(c1)
		} else if (c1 > 191 && c1 < 224) {
			let c2 = bytes[pos++]
			out[c++] = String.fromCharCode((c1 & 31) << 6 | c2 & 63)
		} else if (c1 > 239 && c1 < 365) {
			// Surrogate Pair
			let c2 = bytes[pos++]
			let c3 = bytes[pos++]
			let c4 = bytes[pos++]
			let u = ((c1 & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63) - 0x10000
			out[c++] = String.fromCharCode(0xD800 + (u >> 10))
			out[c++] = String.fromCharCode(0xDC00 + (u & 1023))
		} else {
			let c2 = bytes[pos++]
			let c3 = bytes[pos++]
			out[c++] =
				String.fromCharCode((c1 & 15) << 12 | (c2 & 63) << 6 | c3 & 63)
		}
	}
	return out.join('')
}
