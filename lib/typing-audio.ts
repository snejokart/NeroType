type ClickSample = { buffer: AudioBuffer; offset: number; duration: number };

/** Predecode once; create a separate voice for each key so fast input can overlap. */
export class TypingAudio {
    private context: AudioContext | null = null;
    private output: GainNode | null = null;
    private sample: ClickSample | null = null;
    private loading: Promise<ClickSample | null> | null = null;
    private voices = new Set<AudioBufferSourceNode>();
    private enabled = true;
    private disposed = false;
    private warned = false;

    constructor(private url: string, private onError: () => void) {}

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        if (!enabled) this.stopVoices();
        else void this.preload();
    }

    preload(): Promise<ClickSample | null> {
        if (this.sample) return Promise.resolve(this.sample);
        this.loading ??= fetch(this.url, { cache: "force-cache" })
            .then(response => {
                if (!response.ok) throw new Error("Audio unavailable");
                return response.arrayBuffer();
            })
            .then(bytes => new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes))
            .then(buffer => {
                if (this.disposed) return null;
                let first = buffer.length;
                let last = 0;
                let peak = 0;
                for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                    const samples = buffer.getChannelData(channel);
                    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
                }
                const threshold = Math.max(0.001, peak * 0.012);
                for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                    const samples = buffer.getChannelData(channel);
                    for (let i = 0; i < samples.length; i++) {
                        if (Math.abs(samples[i]) > threshold) { first = Math.min(first, i); last = Math.max(last, i); }
                    }
                }
                const offset = first < buffer.length ? Math.max(0, first / buffer.sampleRate - 0.004) : 0;
                const end = last > 0 ? Math.min(buffer.duration, last / buffer.sampleRate + 0.025) : buffer.duration;
                this.sample = { buffer, offset, duration: Math.max(0.01, end - offset) };
                return this.sample;
            })
            .catch(() => {
                this.loading = null;
                if (!this.disposed && !this.warned) { this.warned = true; this.onError(); }
                return null;
            });
        return this.loading;
    }

    play() {
        if (!this.enabled || this.disposed) return;
        try {
            if (!this.context) {
                this.context = new AudioContext({ latencyHint: "interactive" });
                this.output = this.context.createGain();
                this.output.gain.value = 0.4;
                const compressor = this.context.createDynamicsCompressor();
                compressor.threshold.value = -9;
                compressor.knee.value = 12;
                compressor.ratio.value = 6;
                compressor.attack.value = 0.002;
                compressor.release.value = 0.08;
                this.output.connect(compressor);
                compressor.connect(this.context.destination);
            }
            // Resume synchronously from the actual key gesture, before any awaits.
            void this.context.resume().catch(() => {});
            const requestedAt = performance.now();
            if (this.sample) this.startVoice(this.sample);
            else void this.preload().then(sample => {
                if (sample && performance.now() - requestedAt < 150) this.startVoice(sample);
            });
        } catch { /* Typing remains available if the browser blocks audio. */ }
    }

    private startVoice(sample: ClickSample) {
        if (!this.enabled || this.disposed || !this.context || !this.output) return;
        if (this.voices.size >= 12) {
            const oldest = this.voices.values().next().value;
            if (oldest) { try { oldest.stop(); } catch {} this.voices.delete(oldest); }
        }
        const source = this.context.createBufferSource();
        source.buffer = sample.buffer;
        source.connect(this.output);
        this.voices.add(source);
        source.onended = () => { this.voices.delete(source); source.disconnect(); };
        source.start(this.context.currentTime, sample.offset, sample.duration);
    }

    private stopVoices() {
        for (const voice of this.voices) { try { voice.stop(); } catch {} }
        this.voices.clear();
    }

    dispose() {
        this.disposed = true;
        this.stopVoices();
        if (this.context) void this.context.close().catch(() => {});
    }
}
