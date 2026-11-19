import { useCallback, useRef, useEffect } from 'react'
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react'
import type { ReactFlowInstance, Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useBuilder } from './store/builderStore'
import { nodeTypes } from './nodes/CustomNodes'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { CodePanel } from './components/CodePanel'
import { ChartPanel } from './components/ChartPanel'
import { StatsPanel } from './components/StatsPanel'
import type { BlockData } from './types'

export default function App() {
  const nodes = useBuilder((s) => s.nodes)
  const edges = useBuilder((s) => s.edges)
  const onNodesChange = useBuilder((s) => s.onNodesChange)
  const onEdgesChange = useBuilder((s) => s.onEdgesChange)
  const onConnect = useBuilder((s) => s.onConnect)
  const onDrop = useBuilder((s) => s.onDrop)
  const setInstance = useBuilder((s) => s.setInstance)
  const loadDemo = useBuilder((s) => s.loadDemo)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const didInit = useRef(false)

  // Cargar ejemplo al arrancar
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    loadDemo()
  }, [loadDemo])

  const onInit = useCallback(
    (inst: ReactFlowInstance<Node<BlockData>>) => {
      setInstance(inst as unknown as ReactFlowInstance)
      // Ajustar vista tras montar los nodos del ejemplo
      setTimeout(() => inst.fitView({ padding: 0.2 }), 60)
    },
    [setInstance],
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const drop = useCallback(
    (e: React.DragEvent) => {
      const inst = useBuilder.getState().instance
      if (!inst) return
      onDrop(e, inst.screenToFlowPosition)
    },
    [onDrop],
  )

  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <Sidebar />

        <main className="canvas-area" ref={wrapperRef} onDrop={drop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={onInit}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} color="#e2e8f0" />
            <Controls />
            <MiniMap pannable zoomable nodeStrokeWidth={3} />
          </ReactFlow>
        </main>

        <aside className="right-panels">
          <StatsPanel />
          <ChartPanel />
          <CodePanel />
        </aside>
      </div>
    </div>
  )
}