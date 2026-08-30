---
name: design-an-interface
description: Makes several very different interface designs for a module with sub-agents that run at the same time. Use it when the user wants to design an API, compare interface options, compare the shapes of a module, or says "design it twice".
---

# Design an Interface

This skill uses the "Design It Twice" method from the book "A Philosophy of
Software Design". Your first design is usually not the best design. Make several
very different designs. Then compare them.

## Procedure

### 1. Collect the requirements

Before you design, get the answer to each of these questions:

- [ ] Which problem does this module solve?
- [ ] Who calls this module? The callers can be other modules, external users,
      or tests.
- [ ] Which are the primary operations?
- [ ] Which constraints apply? Constraints include performance, compatibility,
      and the patterns that the code already uses.
- [ ] Which parts stay internal, and which parts become public?

Ask the user: "What must this module do? Who will use it?"

### 2. Make the designs with sub-agents

Start 3 sub-agents or more at the same time. Use the Task tool. Each sub-agent
must make a **very different** design.

Use this prompt for each sub-agent:

```
Design an interface for: [module description]

Requirements: [gathered requirements]

Constraints for this design: [assign a different constraint to each agent]
- Agent 1: "Minimize method count - aim for 1-3 methods max"
- Agent 2: "Maximize flexibility - support many use cases"
- Agent 3: "Optimize for the most common case"
- Agent 4: "Take inspiration from [specific paradigm/library]"

Output format:
1. Interface signature (types/methods)
2. Usage example (how caller uses it)
3. What this design hides internally
4. Trade-offs of this approach
```

### 3. Show the designs

Show each design with these three parts:

1. **The interface**: the types, the methods, and the parameters.
2. **Examples of use**: the code that a caller writes.
3. **The hidden parts**: the complex logic that stays internal.

Show the designs one after the other. The user can then read each design before
the comparison starts.

### 4. Compare the designs

After you show all the designs, compare them against these criteria:

- **Simplicity of the interface**: fewer methods and simpler parameters.
- **General use against special use**: flexibility against a narrow focus.
- **Efficiency of the implementation**: the shape of the interface must permit
  efficient internal code.
- **Depth**: a small interface that hides much complexity is good. A large
  interface with a thin implementation is bad.
- **Correct use against incorrect use**: the design must make correct use easy
  and incorrect use difficult.

Write the comparison in prose. Do not use a table. Show the points where the
designs differ most.

### 5. Combine the designs

The best design frequently takes parts from more than one option. Ask the user:

- "Which design fits your primary use best?"
- "Which parts of the other designs do you want in it?"

## Evaluation criteria

These criteria come from "A Philosophy of Software Design".

**Simplicity of the interface**: fewer methods and simpler parameters make the
module easier to learn and easier to use correctly.

**General use**: a general interface accepts future uses without a change. But do
not make the interface more general than necessary.

**Efficiency of the implementation**: the shape of the interface must permit
efficient internal code. It must not force awkward internal code.

**Depth**: a small interface that hides much complexity is a deep module, and a
deep module is good. A large interface with a thin implementation is a shallow
module. Do not make shallow modules.

## Errors to prevent

- Do not let the sub-agents make similar designs. Make each design very
  different.
- Do not omit the comparison. The comparison gives the value.
- Do not write the implementation. This skill designs the interface only.
- Do not evaluate a design by the quantity of work in its implementation.
