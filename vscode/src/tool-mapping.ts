export const TOOL_MAPPING: Record<string, string> = {
  brop_navigate: 'navigate',
  brop_get_page_content: 'get_page_content',
  brop_get_simplified_content: 'get_simplified_dom',
  brop_execute_script: 'execute_console',
  brop_click_element: 'click',
  brop_type_text: 'type',
  brop_create_page: 'create_tab',
  brop_close_tab: 'close_tab',
  brop_list_tabs: 'list_tabs',
  brop_activate_tab: 'activate_tab',
  brop_get_server_status: 'get_server_status',
  brop_start_console_capture: 'start_console_capture',
  brop_get_console_logs: 'get_console_logs',
  brop_clear_console_logs: 'clear_console_logs',
  brop_stop_console_capture: 'stop_console_capture',
  cdp_execute_command: 'cdp_execute_command',
  cdp_create_page: 'cdp_create_page',
  cdp_navigate: 'cdp_navigate',
  cdp_evaluate: 'cdp_evaluate',
};

export function getMethodForTool(toolId: string): string | undefined {
  return TOOL_MAPPING[toolId];
}
