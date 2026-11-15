import { SwfPanel } from "./SwfPanel.js";
// tool_panel buttons the client uses; their positions are the original ones (stage bottom = 594).
const BUTTONS = {
    SelectButton: "select", BuyButton: "terrain", BuildButton: "build", RoadButton: "road", DemolitionButton: "demolish",
    VaultButton: "storage",
};
// ToolsBar: SpecialButton is the multifunction button (move, money collector and contract signator services) and
// InvestButton opens the investments. Both depend on the original server, so they only report that.
const ACTIONS = { SpecialButton: "multifunction", InvestButton: "invest" };
// Visitor role (ToolsBar for ROLE_VISITOR): Select, Go Home and the upgrade counter (UpgradeButton, the remaining
// upgrades of this visit).
const VISITOR_BUTTONS = { SelectButton: "select" };
const VISITOR_ACTIONS = { GohomeButton: "home" };
const VISITOR_INFO = ["UpgradeButton"];
export class Toolbar {
    constructor(host, layout, ui, freeLabel, onTool, onAction, visitor = false) {
        this.onTool = onTool;
        this.visitor = visitor;
        this.current = "select";
        const buttons = visitor ? VISITOR_BUTTONS : BUTTONS;
        const actions = visitor ? VISITOR_ACTIONS : ACTIONS;
        const centred = [...Object.keys(buttons), ...Object.keys(actions)].filter((n) => layout.layers[n]);
        const shown = [...centred, ...(visitor ? VISITOR_INFO : [])].filter((n) => layout.layers[n]);
        const skip = new Set(layout.order.filter((n) => !n.includes("@") && !shown.includes(n)));
        this.panel = new SwfPanel(layout, ui, skip);
        for (const [name, tool] of Object.entries(buttons))
            this.panel.makeButton(name, () => this.onTool(tool));
        for (const [name, action] of Object.entries(actions))
            this.panel.makeButton(name, () => onAction(action));
        for (const f of layout.text_fields)
            if (f.layer === "RoadButton")
                this.panel.setText(f.path, freeLabel, true);
        const root = this.panel.root;
        root.classList.add("toolbar");
        // ToolsBar.resize: x = (stageWidth - width) / 2 with the width of the visible buttons, y = stageHeight.
        const left = Math.min(...centred.map((n) => layout.layers[n].x));
        const right = Math.max(...centred.map((n) => layout.layers[n].x + layout.layers[n].w));
        root.style.left = `calc(50% - ${(right - left) / 2 + left - this.panel.minX}px)`;
        root.style.top = `calc(100% + ${this.panel.minY}px)`;
        host.append(root);
        this.select("select");
    }
    select(tool) {
        this.current = tool;
        for (const [name, t] of Object.entries(this.visitor ? VISITOR_BUTTONS : BUTTONS))
            this.panel.setSelected(name, t === tool);
    }
    // Puts a panel that shares the tool panel's registration point (MultifunctionBar) on the tool bar.
    attach(child) {
        this.panel.placeChild(child, [0, 0]);
        this.panel.root.append(child.root);
    }
    // UpgradeButton caption: upgrades left in this visit.
    setUpgradesLeft(n) {
        this.panel.setText("UpgradeButton/ButtonText/Caption", String(n), true);
    }
    get tool() {
        return this.current;
    }
}
//# sourceMappingURL=Toolbar.js.map