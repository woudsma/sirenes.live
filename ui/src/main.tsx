import React from 'react'
import ReactDOM from 'react-dom/client'
import { ChakraProvider, createSystem, defaultConfig } from '@chakra-ui/react'
import App from './App'

const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      colors: {
        brand: {
          400: { value: '#f97362' },
          500: { value: '#ef4444' },
          600: { value: '#dc2626' },
        },
      },
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChakraProvider value={system}>
      <App />
    </ChakraProvider>
  </React.StrictMode>
)
