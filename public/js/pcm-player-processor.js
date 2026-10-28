// pcm-player-processor.js
class PCMPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = []; // Store incoming chunks instead of individual samples
    this.currentChunk = null;
    this.chunkIndex = 0;

    this.port.onmessage = (event) => {
      const chunk = event.data;
      if (chunk && chunk.length > 0) {
        this.chunks.push(chunk); // Push the whole chunk at once
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0]; // Process mono audio

    for (let i = 0; i < channel.length; i++) {
      // If we don't have a chunk or finished the current one, grab the next one
      if (!this.currentChunk || this.chunkIndex >= this.currentChunk.length) {
        if (this.chunks.length > 0) {
          this.currentChunk = this.chunks.shift(); // Shifting a chunk is fine (happens rarely)
          this.chunkIndex = 0;
        } else {
          this.currentChunk = null;
        }
      }

      // Play the sample if we have it, else output silence
      if (this.currentChunk) {
        channel[i] = this.currentChunk[this.chunkIndex++];
      } else {
        channel[i] = 0; // Silence
      }
    }
    return true; // Keep processor alive
  }
}

registerProcessor('pcm-player-processor', PCMPlayerProcessor);