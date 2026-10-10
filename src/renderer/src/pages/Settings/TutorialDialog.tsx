import React, { useEffect, useRef, useState } from 'react'

import styles from './Settings.module.css'

import {
  TUTORIAL_STEPS,
  isLastStep,
  nextStep,
  prevStep
} from './tutorialSteps.js'

interface TutorialDialogProps {
  open: boolean
  onClose: () => void
}

const TutorialDialog: React.FC<TutorialDialogProps> = ({
  open,
  onClose
}) => {
  const [step, setStep] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const n = TUTORIAL_STEPS.length

  useEffect(() => {
    if (!open) return
    setStep(0)
    dialogRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const current = TUTORIAL_STEPS[step]
  const last = isLastStep(step, n)

  return (
    <div
      className={styles.tutorialBackdrop}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={styles.tutorialDialog}
        role="dialog"
        aria-modal="true"
        aria-label="How to add a tab"
        tabIndex={-1}
        ref={dialogRef}
      >
        <button
          className={styles.tutorialClose}
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <p className={styles.tutorialCount}>
          Step {step + 1} of {n}
        </p>
        <h3>{current.title}</h3>
        <p className={styles.tutorialBody}>{current.body}</p>
        <div className={styles.tutorialDots}>
          {TUTORIAL_STEPS.map((s, i) => (
            <span
              key={s.title}
              className={styles.tutorialDot}
              data-active={i === step}
            />
          ))}
        </div>
        <div className={styles.tutorialActions}>
          <button
            disabled={step === 0}
            onClick={() => setStep(prevStep(step))}
          >
            Back
          </button>
          {last ? (
            <button onClick={onClose}>Done</button>
          ) : (
            <button onClick={() => setStep(nextStep(step, n))}>Next</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default TutorialDialog
