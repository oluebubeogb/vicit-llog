'use client';

import { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/** Animated height disclosure — rich open and close. */
export default function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ height: { duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }, opacity: { duration: 0.25 } }}
          style={{ overflow: 'hidden' }}
        >
          <motion.div
            initial={{ y: -6 }}
            animate={{ y: 0 }}
            exit={{ y: -6 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
