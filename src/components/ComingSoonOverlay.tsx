import React from 'react';
import { motion } from "framer-motion";

const ComingSoonOverlay = () => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-[3px] pointer-events-none select-none overflow-hidden rounded-3xl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
        animate={{ opacity: 1, scale: 1, rotate: -12 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="p-8 md:p-12 border-[6px] border-dashed border-green-900/20 rounded-[3rem] flex flex-col items-center justify-center"
      >
        <h2 className="text-4xl md:text-6xl font-black text-green-900/70 uppercase tracking-tighter leading-[0.8]">Coming</h2>
        <h2 className="text-4xl md:text-6xl font-black text-green-900/70 uppercase tracking-tighter leading-[0.8]">Soon</h2>
      </motion.div>
    </div>
  );
};

export default ComingSoonOverlay;
