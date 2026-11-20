import { useCallback, useEffect, useMemo } from 'react'
import { ReactFlow, Background, Controls } from '@xyflow/react'
import type { Connection, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useBuilder } from './store/builderStore'
import type { FlowInstance } from './store/builderStore'
import { canConnect } from './store/connect'
import { generatePine } from './codegen/generator'
import { nodeTypes } from './nodes/CustomNodes'
import { Sidebar, DRAG_TYPE } from './components/Sidebar'
import { SiteNav } from './components/SiteNav'
import { Toolbar } from './components/Toolbar'
import { CodePanel } from './components/CodePanel'
import { ChartPanel } from './components/ChartPanel'
import { StatsPanel } from './components/StatsPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { Mt5Panel } from './components/Mt5Panel'
import { Footer } from './components/Footer'
import type { BlockType } from './types'

const RUN_DELAY_MS = 350

export default function App() {
  const nodes = useBuilder((s) => s.nodes)
  const edges = useBuilder((s) => s.edges)
  const title = useBuilder((s) => s.title)
  const settings = useBuilder((s) => s.settings)
  const candles = useBuilder((s) => s.candles)
  const onNodesChange = useBuilder((s) => s.onNodesChange)
  const onEdgesChange = useBuilder((s) => s.onEdgesChange)
  const onConnect = useBuilder((s) => s.onConnect)
  const setInstance = useBuilder((s) => s.setInstance)

  // Moving a block changes "nodes" but not the script, so the run below is
  // keyed on the generated code, not on the graph.
  const gen = useMemo(() => generatePine(nodes, edges, title, settings), [nodes, edges, title, settings])

  useEffect(() => {
    const timer = setTimeout(() => void useBuilder.getState().run(gen), RUN_DELAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen.code, gen.error?.key, candles])

  const onInit = useCallback((inst: FlowInstance) => {
    setInstance(inst)
    setTimeout(() => inst.fitView({ padding: 0.15 }), 60)
  }, [setInstance])

  const isValidConnection = useCallback((c: Connection | Edge) => {
    const s = useBuilder.getState()
    return canConnect(s.nodes, s.edges, c)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const { instance, addBlock } = useBuilder.getState()
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw || !instance) return
    try {
      const { key, type } = JSON.parse(raw) as { key: string; type: BlockType }
      addBlock(key, type, instance.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
    } catch {
      // Something else was dropped on the canvas: ignore it.
    }
  }, [])

  return (
    <div className="app">
      <SiteNav />
      <Toolbar />
      <div className="workspace">
        <Sidebar />

        <div className="center">
          <main className="canvas-area" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onInit={onInit}
              colorMode="dark"
              minZoom={0.2}
              deleteKeyCode={['Backspace', 'Delete']}
              fitView
            >
              <Background gap={18} color="#1c201d" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </main>

          <div className="results">
            <ChartPanel />
            <StatsPanel gen={gen} />
          </div>
        </div>

        <aside className="right-panels">
          <SettingsPanel />
          <CodePanel gen={gen} />
          <Mt5Panel gen={gen} />
          <Footer />
        </aside>
      </div>
    </div>
  )
}
