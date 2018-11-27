import * as fs from 'fs';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import { expect } from 'chai';
import { loadCanvasFromFile, compareBuffers, createCanvas, compareCanvases } from './common';
import { Psd, WriteOptions, ReadOptions } from '../psd';
import { writePsd, writeSignature, getWriterBuffer, createWriter } from '../psdWriter';
import { readPsd, createReader } from '../psdReader';

const layerImagesPath = path.join(__dirname, '..', '..', 'test', 'layer-images');
const writeFilesPath = path.join(__dirname, '..', '..', 'test', 'write');
const resultsFilesPath = path.join(__dirname, '..', '..', 'results');

function writeAndRead(psd: Psd, writeOptions: WriteOptions = {}, readOptions: ReadOptions = {}) {
	const writer = createWriter();
	writePsd(writer, psd, writeOptions);
	const buffer = getWriterBuffer(writer);
	const reader = createReader(buffer);
	return readPsd(reader, readOptions);
}

function loadPsdFromJSONAndPNGFiles(basePath: string) {
	const psd: Psd = JSON.parse(fs.readFileSync(path.join(basePath, 'data.json'), 'utf8'));
	psd.canvas = loadCanvasFromFile(path.join(basePath, 'canvas.png'));
	psd.children!.forEach((l, i) => {
		if (!l.children) {
			l.canvas = loadCanvasFromFile(path.join(basePath, `layer-${i}.png`));
		}
	});
	return psd;
}

describe('PsdWriter', () => {
	it('does not throw if writing psd with empty canvas', () => {
		const writer = createWriter();
		const psd: Psd = {
			width: 300,
			height: 200
		};

		writePsd(writer, psd);
	});

	it('throws if passed invalid signature', () => {
		const writer = createWriter();

		for (const s of [undefined, null, 'a', 'ab', 'abcde']) {
			expect(() => writeSignature(writer, s as any), s as any).throw(`Invalid signature: '${s}'`);
		}
	});

	it('throws exception if has layer with both children and canvas properties set', () => {
		const writer = createWriter();
		const psd: Psd = {
			width: 300,
			height: 200,
			children: [
				{
					children: [],
					canvas: createCanvas(300, 300),
				}
			]
		};

		expect(() => writePsd(writer, psd)).throw(`Invalid layer: cannot have both 'canvas' and 'children' properties set`);
	});

	it('throws if psd has invalid width or height', () => {
		const writer = createWriter();
		const psd: Psd = {
			width: -5,
			height: 0,
		};

		expect(() => writePsd(writer, psd)).throw(`Invalid document size`);
	});

	const fullImage = loadCanvasFromFile(path.join(layerImagesPath, 'full.png'));
	const transparentImage = loadCanvasFromFile(path.join(layerImagesPath, 'transparent.png'));
	const trimmedImage = loadCanvasFromFile(path.join(layerImagesPath, 'trimmed.png'));
	const croppedImage = loadCanvasFromFile(path.join(layerImagesPath, 'cropped.png'));
	const paddedImage = loadCanvasFromFile(path.join(layerImagesPath, 'padded.png'));

	describe('layer left, top, right, bottom handling', () => {
		it('handles undefined left, top, right, bottom with layer image the same size as document', () => {
			const psd: Psd = {
				width: 300,
				height: 200,
				children: [
					{
						name: 'test',
						canvas: fullImage,
					},
				],
			};

			const result = writeAndRead(psd);

			const layer = result.children![0];
			compareCanvases(fullImage, layer.canvas, 'full-layer-image');
			expect(layer.left).equal(0);
			expect(layer.top).equal(0);
			expect(layer.right).equal(300);
			expect(layer.bottom).equal(200);
		});

		it('handles layer image larger than document', () => {
			const psd: Psd = {
				width: 100,
				height: 50,
				children: [
					{
						name: 'test',
						canvas: fullImage,
					},
				],
			};

			const result = writeAndRead(psd);

			const layer = result.children![0];
			compareCanvases(fullImage, layer.canvas, 'oversized-layer-image');
			expect(layer.left).equal(0);
			expect(layer.top).equal(0);
			expect(layer.right).equal(300);
			expect(layer.bottom).equal(200);
		});

		it('aligns layer image to top left if layer image is smaller than document', () => {
			const psd: Psd = {
				width: 300,
				height: 200,
				children: [
					{
						name: 'test',
						canvas: trimmedImage,
					},
				],
			};

			const result = writeAndRead(psd);

			const layer = result.children![0];
			compareCanvases(trimmedImage, layer.canvas, 'smaller-layer-image');
			expect(layer.left).equal(0);
			expect(layer.top).equal(0);
			expect(layer.right).equal(192);
			expect(layer.bottom).equal(68);
		});

		it('does not trim transparent layer image if trim option is not passed', () => {
			const psd: Psd = {
				width: 300,
				height: 200,
				children: [
					{
						name: 'test',
						canvas: transparentImage,
					},
				],
			};

			const result = writeAndRead(psd);

			const layer = result.children![0];
			compareCanvases(transparentImage, layer.canvas, 'transparent-layer-image');
			expect(layer.left).equal(0);
			expect(layer.top).equal(0);
			expect(layer.right).equal(300);
			expect(layer.bottom).equal(200);
		});

		it('trims transparent layer image if trim option is set', () => {
			const psd: Psd = {
				width: 300,
				height: 200,
				children: [
					{
						name: 'test',
						canvas: transparentImage,
					},
				],
			};

			const result = writeAndRead(psd, { trimImageData: true });

			const layer = result.children![0];
			compareCanvases(trimmedImage, layer.canvas, 'trimmed-layer-image');
			expect(layer.left).equal(51);
			expect(layer.top).equal(65);
			expect(layer.right).equal(243);
			expect(layer.bottom).equal(133);
		});

		it('positions the layer at given left/top offsets', () => {
			const psd: Psd = {
				width: 300,
				height: 200,
				children: [
					{
						name: 'test',
						left: 50,
						top: 30,
						canvas: fullImage,
					},
				],
			};

			const result = writeAndRead(psd);

			const layer = result.children![0];
			compareCanvases(fullImage, layer.canvas, 'left-top-layer-image');
			expect(layer.left).equal(50);
			expect(layer.top).equal(30);
			expect(layer.right).equal(350);
			expect(layer.bottom).equal(230);
		});

		it('crops layer to right/bottom values', () => {
			const psd: Psd = {
				width: 300,
				height: 200,
				children: [
					{
						name: 'test',
						right: 200,
						bottom: 100,
						canvas: fullImage,
					},
				],
			};

			const result = writeAndRead(psd);

			const layer = result.children![0];
			compareCanvases(croppedImage, layer.canvas, 'cropped-layer-image');
			expect(layer.left).equal(0);
			expect(layer.top).equal(0);
			expect(layer.right).equal(200);
			expect(layer.bottom).equal(100);
		});

		it('pads layer to right/bottom values', () => {
			const psd: Psd = {
				width: 300,
				height: 200,
				children: [
					{
						name: 'test',
						right: 400,
						bottom: 250,
						canvas: fullImage,
					},
				],
			};

			const result = writeAndRead(psd);

			const layer = result.children![0];
			compareCanvases(paddedImage, layer.canvas, 'padded-layer-image');
			expect(layer.left).equal(0);
			expect(layer.top).equal(0);
			expect(layer.right).equal(400);
			expect(layer.bottom).equal(250);
		});

		it('does not save layer image if left/top/right/bottom amount to empty picture', () => {
			const psd: Psd = {
				width: 300,
				height: 200,
				children: [
					{
						name: 'test',
						left: 50,
						top: 50,
						right: 50,
						bottom: 50,
						canvas: fullImage,
					},
				],
			};

			const result = writeAndRead(psd);

			const layer = result.children![0];
			expect(layer.canvas).undefined;
			expect(layer.left).equal(50);
			expect(layer.top).equal(50);
			expect(layer.right).equal(50);
			expect(layer.bottom).equal(50);
		});

		it('does not save layer image if left/top/right/bottom values amount to negative size', () => {
			const psd: Psd = {
				width: 300,
				height: 200,
				children: [
					{
						name: 'test',
						left: 50,
						top: 50,
						right: 0,
						bottom: 0,
						canvas: fullImage,
					},
				],
			};

			const result = writeAndRead(psd);

			const layer = result.children![0];
			expect(layer.canvas).undefined;
			expect(layer.left).equal(50);
			expect(layer.top).equal(50);
			expect(layer.right).equal(50);
			expect(layer.bottom).equal(50);
		});
	});

	fs.readdirSync(writeFilesPath).forEach(f => {
		it(`writes PSD file (${f})`, () => {
			const basePath = path.join(writeFilesPath, f);
			const psd = loadPsdFromJSONAndPNGFiles(basePath);
			const writer = createWriter();
			const before = JSON.stringify(psd, replacer);

			writePsd(writer, psd, { generateThumbnail: true, trimImageData: true });

			const after = JSON.stringify(psd, replacer);

			expect(before).equal(after, 'psd object mutated');

			const buffer = new Buffer(getWriterBuffer(writer));

			mkdirp.sync(resultsFilesPath);
			fs.writeFileSync(path.join(resultsFilesPath, `${f}.psd`), buffer);

			const reader = createReader(buffer.buffer);
			const result = readPsd(reader, { skipLayerImageData: true });
			fs.writeFileSync(path.join(resultsFilesPath, f + '-composite.png'), result.canvas!.toBuffer());
			//compareCanvases(psd.canvas, result.canvas, 'composite image');

			const expected = fs.readFileSync(path.join(basePath, 'expected.psd'));
			compareBuffers(buffer, expected, `ArrayBufferPsdWriter`);
		});
	});
});

function replacer(key: string, value: any) {
	if (key === 'canvas') {
		return '<canvas>';
	} else {
		return value;
	}
}
