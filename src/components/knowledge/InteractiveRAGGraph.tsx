import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Sphere, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ZoomIn, 
  ZoomOut,
  Filter,
  Search,
  Network,
  Brain
} from 'lucide-react';

// Node component for each content item
function GraphNode({ 
  position, 
  color, 
  size, 
  label, 
  contentType, 
  onClick, 
  isSelected,
  similarity 
}: {
  position: [number, number, number];
  color: string;
  size: number;
  label: string;
  contentType: string;
  onClick: () => void;
  isSelected: boolean;
  similarity?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (meshRef.current) {
      // Gentle rotation for better visibility
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
      
      // Pulsing effect for selected nodes
      if (isSelected) {
        const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
        meshRef.current.scale.setScalar(scale);
      }
    }
  });

  return (
    <group position={position}>
      <Sphere
        ref={meshRef}
        args={[size, 32, 32]}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshStandardMaterial 
          color={color} 
          transparent 
          opacity={isSelected ? 0.9 : 0.7}
          emissive={color}
          emissiveIntensity={hovered ? 0.2 : 0}
        />
      </Sphere>
      
      {(hovered || isSelected) && (
        <Html distanceFactor={10}>
          <div className="bg-foreground/80 text-primary-foreground px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none">
            <div className="font-semibold">{label}</div>
            <div className="text-muted-foreground">{contentType}</div>
            {similarity !== undefined && (
              <div className="text-muted-foreground">Similarity: {Math.round(similarity * 100)}%</div>
            )}
          </div>
        </Html>
      )}
      
      {isSelected && (
        <Text
          position={[0, size + 0.5, 0]}
          fontSize={0.5}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
      )}
    </group>
  );
}

// Connection line between related nodes
function ConnectionLine({ 
  start, 
  end, 
  strength, 
  type 
}: {
  start: [number, number, number];
  end: [number, number, number];
  strength: number;
  type: string;
}) {
  const points = useMemo(() => [
    new THREE.Vector3(...start),
    new THREE.Vector3(...end)
  ], [start, end]);

  const lineColor = useMemo(() => {
    switch (type) {
      case 'semantic': return '#8B5CF6'; // Purple
      case 'category': return '#10B981'; // Green
      case 'location': return '#F59E0B'; // Yellow
      default: return '#6B7280'; // Gray
    }
  }, [type]);

  return (
    <Line
      points={points}
      color={lineColor}
      lineWidth={strength * 5}
      transparent
      opacity={0.6}
    />
  );
}

// Main 3D scene component
function Scene({ 
  nodes, 
  connections, 
  selectedNode, 
  onNodeClick, 
  showConnections,
  animationSpeed 
}: {
  nodes: any[];
  connections: any[];
  selectedNode: string | null;
  onNodeClick: (nodeId: string) => void;
  showConnections: boolean;
  animationSpeed: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current && animationSpeed > 0) {
      groupRef.current.rotation.y = state.clock.elapsedTime * animationSpeed * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Ambient lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} />
      
      {/* Render nodes */}
      {nodes.map((node) => (
        <GraphNode
          key={node.id}
          position={node.position}
          color={node.color}
          size={node.size}
          label={node.label}
          contentType={node.contentType}
          onClick={() => onNodeClick(node.id)}
          isSelected={selectedNode === node.id}
          similarity={node.similarity}
        />
      ))}
      
      {/* Render connections */}
      {showConnections && connections.map((connection, index) => (
        <ConnectionLine
          key={index}
          start={connection.start}
          end={connection.end}
          strength={connection.strength}
          type={connection.type}
        />
      ))}
    </group>
  );
}

// Control panel component
function ControlPanel({ 
  onReset, 
  animationSpeed, 
  setAnimationSpeed,
  showConnections,
  setShowConnections,
  filteredTypes,
  setFilteredTypes,
  similarityThreshold,
  setSimilarityThreshold 
}: {
  onReset: () => void;
  animationSpeed: number;
  setAnimationSpeed: (speed: number) => void;
  showConnections: boolean;
  setShowConnections: (show: boolean) => void;
  filteredTypes: string[];
  setFilteredTypes: (types: string[]) => void;
  similarityThreshold: number;
  setSimilarityThreshold: (threshold: number) => void;
}) {
  const contentTypes = ['venue', 'event', 'tag', 'group', 'marketplace'];

  const toggleContentType = (type: string) => {
    if (filteredTypes.includes(type)) {
      setFilteredTypes(filteredTypes.filter(t => t !== type));
    } else {
      setFilteredTypes([...filteredTypes, type]);
    }
  };

  return (
    <Card className="absolute top-4 left-4 w-80 bg-foreground/80 text-primary-foreground border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Network className="h-5 w-5" />
          Graph Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Animation Speed */}
        <div className="space-y-2">
          <Label className="text-sm">Animation Speed</Label>
          <Slider
            value={[animationSpeed]}
            onValueChange={(value) => setAnimationSpeed(value[0])}
            max={5}
            min={0}
            step={0.1}
            className="w-full"
          />
        </div>

        {/* Show Connections */}
        <div className="flex items-center space-x-2">
          <Switch
            id="connections"
            checked={showConnections}
            onCheckedChange={setShowConnections}
          />
          <Label htmlFor="connections" className="text-sm">Show Connections</Label>
        </div>

        {/* Similarity Threshold */}
        <div className="space-y-2">
          <Label className="text-sm">Similarity Threshold: {Math.round(similarityThreshold * 100)}%</Label>
          <Slider
            value={[similarityThreshold]}
            onValueChange={(value) => setSimilarityThreshold(value[0])}
            max={1}
            min={0}
            step={0.05}
            className="w-full"
          />
        </div>

        {/* Content Type Filters */}
        <div className="space-y-2">
          <Label className="text-sm">Content Types</Label>
          <div className="flex flex-wrap gap-1">
            {contentTypes.map((type) => (
              <Button
                key={type}
                variant={filteredTypes.includes(type) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleContentType(type)}
                className="text-xs h-6"
              >
                {type}
              </Button>
            ))}
          </div>
        </div>

        {/* Reset Button */}
        <Button onClick={onReset} variant="outline" size="sm" className="w-full">
          <RotateCcw className="h-3 w-3 mr-1" />
          Reset View
        </Button>
      </CardContent>
    </Card>
  );
}

// Node details panel
function NodeDetailsPanel({ 
  selectedNode, 
  onClose 
}: {
  selectedNode: any | null;
  onClose: () => void;
}) {
  if (!selectedNode) return null;

  return (
    <Card className="absolute top-4 right-4 w-80 bg-foreground/80 text-primary-foreground border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Node Details
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label className="text-sm text-muted-foreground">Type</Label>
          <Badge variant="outline" className="ml-2">{selectedNode.contentType}</Badge>
        </div>
        
        <div>
          <Label className="text-sm text-muted-foreground">Label</Label>
          <p className="text-sm mt-1">{selectedNode.label}</p>
        </div>
        
        {selectedNode.content && (
          <div>
            <Label className="text-sm text-muted-foreground">Content</Label>
            <p className="text-xs mt-1 text-muted-foreground line-clamp-3">{selectedNode.content}</p>
          </div>
        )}
        
        {selectedNode.similarity !== undefined && (
          <div>
            <Label className="text-sm text-gray-300">Similarity Score</Label>
            <p className="text-sm mt-1">{Math.round(selectedNode.similarity * 100)}%</p>
          </div>
        )}
        
        <div>
          <Label className="text-sm text-muted-foreground">Connections</Label>
          <p className="text-sm mt-1">{selectedNode.connections || 0} related items</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Main interactive RAG graph component
export function InteractiveRAGGraph({ 
  ragData = [], 
  initialQuery = '' 
}: {
  ragData?: any[];
  initialQuery?: string;
}) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedNodeData, setSelectedNodeData] = useState<any | null>(null);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [showConnections, setShowConnections] = useState(true);
  const [filteredTypes, setFilteredTypes] = useState(['venue', 'event', 'tag', 'group', 'marketplace']);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.3);

  // Only use real RAG data
  const graphData = useMemo(() => {
    if (ragData.length > 0) {
      return generateGraphFromRAGData(ragData, filteredTypes, similarityThreshold);
    }
    
    // Return empty graph if no real data
    return { nodes: [], connections: [] };
  }, [ragData, filteredTypes, similarityThreshold]);

  const handleNodeClick = (nodeId: string) => {
    setSelectedNode(nodeId);
    const nodeData = graphData.nodes.find(n => n.id === nodeId);
    setSelectedNodeData(nodeData);
  };

  const handleReset = () => {
    setSelectedNode(null);
    setSelectedNodeData(null);
  };

  return (
    <div className="w-full h-[800px] relative bg-background rounded-lg overflow-hidden">
      <Canvas camera={{ position: [0, 0, 15], fov: 75 }}>
        <Scene
          nodes={graphData.nodes}
          connections={graphData.connections}
          selectedNode={selectedNode}
          onNodeClick={handleNodeClick}
          showConnections={showConnections}
          animationSpeed={animationSpeed}
        />
        <OrbitControls 
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          minDistance={5}
          maxDistance={50}
        />
      </Canvas>
      
      <ControlPanel
        onReset={handleReset}
        animationSpeed={animationSpeed}
        setAnimationSpeed={setAnimationSpeed}
        showConnections={showConnections}
        setShowConnections={setShowConnections}
        filteredTypes={filteredTypes}
        setFilteredTypes={setFilteredTypes}
        similarityThreshold={similarityThreshold}
        setSimilarityThreshold={setSimilarityThreshold}
      />
      
      <NodeDetailsPanel
        selectedNode={selectedNodeData}
        onClose={() => {
          setSelectedNode(null);
          setSelectedNodeData(null);
        }}
      />
      
      {/* Legend */}
      <Card className="absolute bottom-4 left-4 bg-foreground/80 text-primary-foreground border-border">
        <CardContent className="p-3">
          <div className="text-xs space-y-1">
            <div className="font-semibold mb-2">Connection Types</div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-purple-500"></div>
              <span>Semantic</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-green-500"></div>
              <span>Category</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-yellow-500"></div>
              <span>Location</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


// Generate graph data from real RAG results
function generateGraphFromRAGData(ragData: any[], filteredTypes: string[], similarityThreshold: number) {
  const colors = {
    venue: '#3B82F6',
    event: '#8B5CF6', 
    tag: '#10B981',
    group: '#F59E0B',
    marketplace: '#EF4444'
  };

  const nodes = ragData
    .filter(item => filteredTypes.includes(item.content_type))
    .map((item, index) => {
      const angle = (index / ragData.length) * Math.PI * 2;
      const radius = 3 + (item.similarity || 0) * 3;
      
      return {
        id: item.content_id || `node-${index}`,
        position: [
          Math.cos(angle) * radius,
          (Math.random() - 0.5) * 4,
          Math.sin(angle) * radius
        ] as [number, number, number],
        color: colors[item.content_type as keyof typeof colors] || '#6B7280',
        size: 0.2 + (item.similarity || 0.5) * 0.3,
        label: item.content_text?.substring(0, 20) + '...' || `${item.content_type} ${index}`,
        contentType: item.content_type,
        similarity: item.similarity,
        content: item.content_text,
        connections: 0
      };
    });

  // Generate connections based on similarity
  const connections = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      // Calculate actual similarity based on content similarity or use metadata
      const similarity = Math.min(nodes[i].similarity || 0.5, nodes[j].similarity || 0.5);
      
      if (similarity > similarityThreshold) {
        connections.push({
          start: nodes[i].position,
          end: nodes[j].position,
          strength: similarity,
          type: 'semantic'
        });
      }
    }
  }

  return { nodes, connections };
}