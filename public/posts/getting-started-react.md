# Getting Started with React in 2026

React has become the most popular library for building user interfaces. In this guide, we'll cover the essential concepts you need to know to start building with React.

## What is React?

React is a JavaScript library for building user interfaces, particularly single-page applications. It was created by Facebook and is maintained by Meta and a community of developers.

### Key Concepts

1. **Components** - The building blocks of React apps
2. **Props** - How data flows from parent to child
3. **State** - How components remember information
4. **Hooks** - Functions that let you use state and other React features

## Your First Component

Here's a simple example:

```jsx
function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>
}
```

This component:
- Receives `name` as a prop
- Returns JSX (JavaScript XML)
- Can be reused anywhere in your app

## Using State with useState

The `useState` hook lets components remember things:

```jsx
import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  )
}
```

**How it works:**
- `useState(0)` creates state with initial value 0
- Returns an array: `[currentValue, setterFunction]`
- Calling `setCount` triggers a re-render with new value

## Side Effects with useEffect

When you need to interact with systems outside React (APIs, timers, DOM):

```jsx
import { useEffect, useState } from 'react'

function UserProfile({ userId }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(data => setUser(data))
  }, [userId])  // Re-run when userId changes

  return user ? <div>{user.name}</div> : <div>Loading...</div>
}
```

## Next Steps

- Learn about `useContext` for sharing state
- Explore React Router for navigation
- Try building a small project
- Practice, practice, practice!

Happy coding! 🚀
