import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

interface TextGenerateEffectProps {
  words: string
  className?: string
  delay?: number
}

export function TextGenerateEffect({ words, className = '', delay = 0 }: TextGenerateEffectProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const wordArray = words.split(' ')

  return (
    <span ref={ref} className={className}>
      {wordArray.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={isInView ? { opacity: 1, filter: 'blur(0px)' } : {}}
          transition={{ duration: 0.4, delay: delay + i * 0.08, ease: 'easeOut' }}
          className="inline-block mr-[0.25em]"
        >
          {word}
        </motion.span>
      ))}
    </span>
  )
}
