import type { Strategy } from '@/lib/mock-data'

export function BytecodePane({ strategy }: { strategy: Strategy }) {
  const instructions = strategy.bytecode

  return (
    <section aria-labelledby="bytecode-heading">
      <h2
        id="bytecode-heading"
        className="font-sans font-semibold text-[1rem] text-wave-text mb-3"
      >
        Bytecode
      </h2>

      <div
        className="rounded-[12px] p-5 overflow-x-auto overflow-y-auto bg-wave-surface border border-wave-border"
        style={{ maxHeight: '320px' }}
        role="region"
        aria-label="Strategy bytecode instructions"
      >
        <table
          className="w-full border-collapse"
          aria-label="Bytecode instructions table"
        >
          <thead className="sr-only">
            <tr>
              <th>Opcode</th>
              <th>Length</th>
              <th>Arguments</th>
            </tr>
          </thead>
          <tbody>
            {instructions.map((instr, i) => (
              <tr key={i} className="align-baseline">
                <td className="pr-4 pb-1.5 whitespace-nowrap">
                  <span
                    className="font-mono text-[13px]"
                    style={{ color: '#2A9D8F' }}
                  >
                    {instr.opcode}
                  </span>
                </td>
                <td className="pr-4 pb-1.5 whitespace-nowrap">
                  <span
                    className="font-mono text-[13px]"
                    style={{ color: '#71767B' }}
                  >
                    {instr.length}
                  </span>
                </td>
                <td className="pb-1.5">
                  <span className="font-mono text-[13px] text-wave-text">
                    {instr.args}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
