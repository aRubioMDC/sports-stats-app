import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { GameDetail } from './pages/GameDetail'
import { Cheatsheet } from './pages/Cheatsheet'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/games/:gameId" element={<GameDetail />} />
        <Route path="/cheatsheet" element={<Cheatsheet />} />
      </Routes>
    </Layout>
  )
}

export default App
