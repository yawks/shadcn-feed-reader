// Simple Suspense resource helper
// Usage: const resource = createResource(() => fetch(...).then(r=>r.json()))
// Then in a component: const data = resource.read()

export function createResource<T>(promiseFactory: () => Promise<T>) {
  let status: 'pending' | 'success' | 'error' = 'pending'
  let result: T
  let error: unknown
  let promise: Promise<void> | null = null

  function load() {
    if (!promise) {
      promise = promiseFactory()
        .then((res) => {
          status = 'success'
          result = res
        })
        .catch((err) => {
          status = 'error'
          error = err
        })
        .finally(() => {
          // noop
        })
    }
  }

  return {
    read(): T {
      load()
      if (status === 'pending') {
        // throw the underlying promise to suspend
        throw promise
      }
      if (status === 'error') {
        throw error
      }
      return result!
    },
  }
}
