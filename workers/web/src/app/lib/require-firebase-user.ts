import { redirect } from '@tanstack/react-router'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

// Resolve outside the observer callback so redirects reject the route's promise.
export const requireFirebaseUser = async () => {
  const user = await new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe()
        resolve(user)
      },
      (error) => {
        unsubscribe()
        reject(error)
      }
    )
  })
  if (!user) throw redirect({ to: '/' })
}
