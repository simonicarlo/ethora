export interface ToolParameter {
  name: string;
  type: 'number' | 'string' | 'boolean';
  label: string;
  default: number | string | boolean;
  min?: number;
  max?: number;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  parameters: ToolParameter[];
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Allows agents to search the web for real-time information during deliberation. Uses Brave Search API to retrieve relevant results.',
    icon: 'search',
    parameters: [
      { name: 'max_uses', type: 'number', label: 'Max uses per round', default: 3, min: 1, max: 10 },
    ],
  },
  {
    id: 'code_execution',
    name: 'Code Execution',
    description: 'Allows agents to execute Python code in a sandboxed environment for calculations, data analysis, or verification tasks.',
    icon: 'code',
    parameters: [
      { name: 'timeout_seconds', type: 'number', label: 'Timeout (seconds)', default: 30, min: 5, max: 120 },
      { name: 'max_output_chars', type: 'number', label: 'Max output characters', default: 5000, min: 100, max: 50000 },
    ],
  },
];
