import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface WordRotateProps {
  words: string[]
  className?: string
  duration?: number
}

export function WordRotate({ words, className = '', duration = 2500 }: WordRotateProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length)
    }, duration)
    return () => clearInterval(interval)
  }, [words.length, duration])

  return (
    <span className={`inline-flex overflow-hidden ${className}`}>
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ y: 30, opacity: 0, filter: 'blur(4px)' }}
          animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
          exit={{ y: -30, opacity: 0, filter: 'blur(4px)' }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block"
        >
          {words[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
