/**
 * electron/export.js
 *
 * Encoding side of the exporter: one ffmpeg process per job, fed raw RGBA frames
 * on stdin by the renderer, with the mixed-down audio handed over as a WAV file.
 *
 * @author Gearfinder Studios
 * @license GPL-3.0-or-later
 */

import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import ffmpegStatic from 'ffmpeg-static';
import { t } from '../src/js/i18n/index.js';

// Inside a packaged build the binary is unpacked next to the asar, where it can run.
const FFMPEG = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');

const CRF = {
	mp4: { high: 16, medium: 20, low: 26 },
	webm: { high: 20, medium: 28, low: 36 }
};

const jobs = new Map();

function videoArgs({ format, quality, transparent }) {
	const crf = String(CRF[format]?.[quality] ?? CRF[format]?.high ?? 18);

	if (format === 'webm') {
		return [
			'-c:v', 'libvpx-vp9',
			'-crf', crf,
			'-b:v', '0',
			'-row-mt', '1',
			'-deadline', 'good',
			'-cpu-used', '2',
			// VP9 is the one target here that can carry an alpha channel.
			'-pix_fmt', transparent ? 'yuva420p' : 'yuv420p'
		];
	}

	return ['-c:v', 'libx264', '-preset', 'medium', '-crf', crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
}

function audioArgs(format) {
	return format === 'webm' ? ['-c:a', 'libopus', '-b:a', '192k'] : ['-c:a', 'aac', '-b:a', '256k'];
}

export async function beginExport(options) {
	const { outPath, format, width, height, fps, duration, audio } = options;
	const id = randomUUID();
	let audioPath = null;

	if (audio?.byteLength) {
		audioPath = join(tmpdir(), `mechaintro-${id}.wav`);
		await writeFile(audioPath, audio);
	}

	const args = [
		'-hide_banner', '-y',
		'-f', 'rawvideo',
		'-pix_fmt', 'rgba',
		'-s', `${width}x${height}`,
		'-r', String(fps),
		'-i', 'pipe:0',
		...(audioPath ? ['-i', audioPath] : []),
		...videoArgs(options),
		...(audioPath ? audioArgs(format) : []),
		'-t', String(duration),
		outPath
	];

	const child = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
	const job = { child, audioPath, outPath, stderr: '', exited: null, cancelled: false };

	job.exited = new Promise(resolve => {
		child.on('close', code => resolve(code));
		child.on('error', error => {
			job.stderr += `\n${error.message}`;
			resolve(-1);
		});
	});

	child.stderr.on('data', chunk => {
		// Only the tail matters; that is where ffmpeg explains what went wrong.
		job.stderr = (job.stderr + chunk.toString()).slice(-4000);
	});

	// A broken pipe surfaces through `close` with a failing code; don't let it crash main.
	child.stdin.on('error', () => {});

	jobs.set(id, job);
	return id;
}

export async function writeFrame(id, frame) {
	const job = jobs.get(id);

	if (!job) {
		throw new Error(t('error.exportNotFound'));
	}
	if (job.child.exitCode !== null) {
		throw new Error(`${t('error.ffmpegExited')}\n${job.stderr}`);
	}

	const buffer = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);

	if (!job.child.stdin.write(buffer)) {
		await new Promise(resolve => {
			const done = () => {
				job.child.stdin.off('drain', done);
				job.child.off('close', done);
				resolve();
			};
			job.child.stdin.once('drain', done);
			job.child.once('close', done);
		});
	}
}

export async function finishExport(id) {
	const job = jobs.get(id);

	if (!job) {
		throw new Error(t('error.exportNotFound'));
	}

	job.child.stdin.end();
	const code = await job.exited;
	await cleanup(id);

	if (code !== 0) {
		throw new Error(`${t('error.ffmpegFailed', { code })}\n${job.stderr}`);
	}
	return job.outPath;
}

export async function cancelExport(id) {
	const job = jobs.get(id);

	if (!job) {
		return;
	}

	job.child.stdin.destroy();
	job.child.kill();
	await job.exited;
	await cleanup(id);
	await rm(job.outPath, { force: true });
}

async function cleanup(id) {
	const job = jobs.get(id);

	jobs.delete(id);
	if (job?.audioPath) {
		await rm(job.audioPath, { force: true });
	}
}

/** Kill whatever is still encoding when the app goes away. */
export function killAllExports() {
	for (const job of jobs.values()) {
		job.child.kill();
	}
}
