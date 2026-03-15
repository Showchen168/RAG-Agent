"use client";

import { useState } from "react";
import {
  extractVariables,
  type PromptVariable,
} from "@/lib/prompts/variable-parser";

interface VariableFormProps {
  template: string;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function VariableForm({
  template,
  onSubmit,
  onCancel,
}: VariableFormProps) {
  const variables = extractVariables(template);
  const [values, setValues] = useState<Record<string, string>>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  if (variables.length === 0) {
    // 無變數，直接使用
    onSubmit({});
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-lg w-full p-4 md:p-6 shadow-2xl mx-4">
        <h3 className="text-lg font-semibold mb-4">填入變數</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {variables.map((variable) => (
            <div key={variable.name}>
              <label className="block text-sm font-medium mb-1.5">
                {variable.placeholder || variable.name}
              </label>
              <input
                type="text"
                value={values[variable.name] || ""}
                onChange={(e) =>
                  setValues({ ...values, [variable.name]: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800"
                placeholder={variable.placeholder}
                required
              />
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium transition-colors"
            >
              確認
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
