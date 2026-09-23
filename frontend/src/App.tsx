import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { GameDetail } from './pages/GameDetail'
import { Cheatsheet } from './pages/Cheatsheet'
import { Trends } from './pages/Trends'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/games/:gameId" element={<GameDetail />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/cheatsheet" element={<Cheatsheet />} />
      </Routes>
    </Layout>
  )
}

export default App
