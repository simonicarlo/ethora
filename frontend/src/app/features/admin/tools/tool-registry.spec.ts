import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { ToolRegistry } from './tool-registry';
import { TOOL_DEFINITIONS } from './tool-registry.data';

describe('ToolRegistry', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolRegistry, NoopAnimationsModule],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should expose all TOOL_DEFINITIONS', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    expect(fixture.componentInstance.tools).toBe(TOOL_DEFINITIONS);
  });

  it('should initialise paramValues with tool defaults', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    const component = fixture.componentInstance;

    for (const tool of TOOL_DEFINITIONS) {
      for (const param of tool.parameters) {
        expect(component.getParamValue(tool.id, param.name)).toBe(param.default);
      }
    }
  });

  it('should start with no tool selected', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    expect(fixture.componentInstance.selectedTool()).toBeNull();
  });

  it('should start with no tools enabled', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    for (const tool of TOOL_DEFINITIONS) {
      expect(fixture.componentInstance.isEnabled(tool.id)).toBe(false);
    }
  });

  it('selectTool() should update selectedTool signal', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    const component = fixture.componentInstance;
    const tool = TOOL_DEFINITIONS[0];

    component.selectTool(tool);
    expect(component.selectedTool()).toBe(tool);
  });

  it('toggleTool() should enable a disabled tool', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    const component = fixture.componentInstance;
    const toolId = TOOL_DEFINITIONS[0].id;

    component.toggleTool(toolId);
    expect(component.isEnabled(toolId)).toBe(true);
  });

  it('toggleTool() should disable an enabled tool', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    const component = fixture.componentInstance;
    const toolId = TOOL_DEFINITIONS[0].id;

    component.toggleTool(toolId);
    component.toggleTool(toolId);
    expect(component.isEnabled(toolId)).toBe(false);
  });

  it('toggleTool() should not affect other tools', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    const component = fixture.componentInstance;

    if (TOOL_DEFINITIONS.length < 2) return;
    const [first, second] = TOOL_DEFINITIONS;

    component.toggleTool(first.id);
    expect(component.isEnabled(first.id)).toBe(true);
    expect(component.isEnabled(second.id)).toBe(false);
  });

  it('setParamValue() should update the value for a specific tool param', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    const component = fixture.componentInstance;
    const tool = TOOL_DEFINITIONS[0];
    const param = tool.parameters[0];

    component.setParamValue(tool.id, param.name, 99);
    expect(component.getParamValue(tool.id, param.name)).toBe(99);
  });

  it('setParamValue() should not mutate other tool params', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    const component = fixture.componentInstance;

    if (TOOL_DEFINITIONS.length < 2) return;
    const [first, second] = TOOL_DEFINITIONS;

    component.setParamValue(first.id, first.parameters[0].name, 42);

    // Second tool's params must be unchanged
    expect(component.getParamValue(second.id, second.parameters[0].name)).toBe(
      second.parameters[0].default,
    );
  });

  it('getParamValue() should return empty string for unknown tool/param', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    expect(fixture.componentInstance.getParamValue('unknown', 'param')).toBe('');
  });

  it('should render tool names in the DOM', () => {
    const fixture = TestBed.createComponent(ToolRegistry);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    for (const tool of TOOL_DEFINITIONS) {
      expect(text).toContain(tool.name);
    }
  });
});
