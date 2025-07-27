"use client";

import React, { useEffect, useRef } from "react";

interface FirecapeSquareProps {
  className?: string;
}

// Perlin noise implementation for smooth, organic movement
class PerlinNoise {
  private perm: number[] = [];
  
  constructor() {
    // Initialize permutation table
    for (let i = 0; i < 256; i++) {
      this.perm[i] = i;
    }
    
    // Shuffle
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
    }
    
    // Duplicate for wrapping
    for (let i = 0; i < 256; i++) {
      this.perm[i + 256] = this.perm[i];
    }
  }
  
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }
  
  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  
  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    const u = this.fade(x);
    const v = this.fade(y);
    
    const a = this.perm[X] + Y;
    const aa = this.perm[a];
    const ab = this.perm[a + 1];
    const b = this.perm[X + 1] + Y;
    const ba = this.perm[b];
    const bb = this.perm[b + 1];
    
    return this.lerp(
      this.lerp(this.grad(this.perm[aa], x, y), this.grad(this.perm[ba], x - 1, y), u),
      this.lerp(this.grad(this.perm[ab], x, y - 1), this.grad(this.perm[bb], x - 1, y - 1), u),
      v
    );
  }
}

const FirecapeSquare: React.FC<FirecapeSquareProps> = ({ className = "" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const noiseRef = useRef<PerlinNoise>(new PerlinNoise());
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Set canvas size
    canvas.width = 11;
    canvas.height = 11;
    
    let time = 0;
    
    const animate = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // First, fill the entire square with a base color
      ctx.fillStyle = "#FFAA00";
      ctx.fillRect(0, 0, 11, 11);
      
      // Create multiple layers of noise-based patterns
      for (let y = 0; y < 11; y++) {
        for (let x = 0; x < 11; x++) {
          // Sample noise at this position with time offset
          const noise1 = noiseRef.current.noise(
            x * 0.3 + time * 0.5,
            y * 0.3 + time * 0.3
          );
          const noise2 = noiseRef.current.noise(
            x * 0.5 + time * 0.7,
            y * 0.5 + time * 0.4
          );
          const noise3 = noiseRef.current.noise(
            x * 0.2 + time * 0.3,
            y * 0.2 + time * 0.6
          );
          
          // Combine noise octaves for more complex patterns
          const combinedNoise = (noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2) * 0.5 + 0.5;
          
          // Map noise to color - slightly closer to FFAA00
          let hue, saturation, lightness;
          if (combinedNoise < 0.25) {
            // Dark orange-red
            hue = 10 + combinedNoise * 20;
            saturation = 100;
            lightness = 35 + combinedNoise * 10;
          } else if (combinedNoise < 0.5) {
            // Deep orange
            hue = 20 + (combinedNoise - 0.25) * 32;
            saturation = 100;
            lightness = 45 + (combinedNoise - 0.25) * 18;
          } else if (combinedNoise < 0.75) {
            // Orange
            hue = 28 + (combinedNoise - 0.5) * 32;
            saturation = 100;
            lightness = 50 + (combinedNoise - 0.5) * 18;
          } else {
            // Bright orange (closer to FFAA00)
            hue = 36 + (combinedNoise - 0.75) * 16;
            saturation = 100;
            lightness = 58 + (combinedNoise - 0.75) * 18;
          }
          
          // Draw pixel
          ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      
      
      time += 0.02; // Adjust speed
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
  
  return (
    <canvas
      ref={canvasRef}
      className={`rounded-sm ${className}`}
      style={{ imageRendering: "crisp-edges" }}
    />
  );
};

export default FirecapeSquare;