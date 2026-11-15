"""Draws docs/er-diagram.png (Chen notation) and docs/relational-schema.png
from the schema in src/db/schema.sql.

    python docs/diagrams/generate_diagrams.py

Needs matplotlib. If the schema changes, edit the data below and re-run.
"""
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse, FancyBboxPatch, Polygon, Rectangle

OUT = Path(__file__).resolve().parent.parent
FONT = "DejaVu Sans"
plt.rcParams["font.family"] = FONT

# ============================================================================
# ER DIAGRAM (Chen notation)
#   rectangle = entity, ellipse = attribute (PK underlined),
#   double ellipse = multivalued, diamond = relationship,
#   double line = total participation, dashed = derived (not stored)
# ============================================================================

ENT_W, ENT_H = 4.6, 1.3
ATT_W, ATT_H = 3.5, 1.15
DIA_W, DIA_H = 3.6, 1.9


def er_diagram():
    fig, ax = plt.subplots(figsize=(34, 22))
    ax.set_xlim(-24, 38.5)
    ax.set_ylim(-22, 17)
    ax.set_aspect("equal")
    ax.axis("off")

    entities = {}

    def entity(name, xy):
        x, y = xy
        w = max(ENT_W, 0.34 * len(name) + 1.0)
        ax.add_patch(Rectangle((x - w / 2, y - ENT_H / 2), w, ENT_H,
                               fc="white", ec="black", lw=2.6, zorder=3))
        ax.text(x, y, name, ha="center", va="center", fontsize=15, fontweight="bold", zorder=4)
        entities[name] = xy

    def attribute(owner_xy, xy, label, pk=False, multi=False, dashed=False):
        ax.plot([owner_xy[0], xy[0]], [owner_xy[1], xy[1]], color="black", lw=1.4, zorder=1)
        ls = "--" if dashed else "-"
        w = max(ATT_W, 0.21 * len(label) + 1.0)
        ax.add_patch(Ellipse(xy, w, ATT_H, fc="white", ec="black", lw=1.6, ls=ls, zorder=3))
        if multi:
            ax.add_patch(Ellipse(xy, w - 0.35, ATT_H - 0.3, fc="none", ec="black", lw=1.2, zorder=4))
        t = ax.text(xy[0], xy[1], label, ha="center", va="center", fontsize=11.5, zorder=5)
        if pk:
            t.set_fontweight("bold")
            # underline
            w = 0.135 * len(label)
            ax.plot([xy[0] - w / 2, xy[0] + w / 2], [xy[1] - 0.27, xy[1] - 0.27], color="black", lw=1.3, zorder=5)

    def attributes(owner, attrs, a0, a1, r0=4.2, r1=6.0):
        """Spread attributes on an arc from angle a0 to a1 (degrees), alternating radius."""
        ox, oy = entities[owner]
        n = len(attrs)
        for i, a in enumerate(attrs):
            ang = math.radians(a0 + (a1 - a0) * (i / (n - 1) if n > 1 else 0.5))
            r = r0 if i % 2 == 0 else r1
            label, opts = (a, {}) if isinstance(a, str) else a
            attribute((ox, oy), (ox + r * math.cos(ang), oy + r * math.sin(ang)), label, **opts)

    def diamond(name, xy, dashed=False):
        x, y = xy
        pts = [(x, y + DIA_H / 2), (x + DIA_W / 2, y), (x, y - DIA_H / 2), (x - DIA_W / 2, y)]
        ax.add_patch(Polygon(pts, closed=True, fc="#eeeeee", ec="black", lw=2.2,
                             ls="--" if dashed else "-", zorder=3))
        ax.text(x, y, name, ha="center", va="center", fontsize=11.5, fontweight="bold", zorder=4)
        return xy

    def link(a, b, card, total=False, dashed=False, label_at=0.22, card_offset=(0.35, 0.35)):
        (x1, y1), (x2, y2) = a, b
        ls = "--" if dashed else "-"
        if total:
            dx, dy = x2 - x1, y2 - y1
            L = math.hypot(dx, dy)
            nx, ny = -dy / L * 0.12, dx / L * 0.12
            for s in (1, -1):
                ax.plot([x1 + s * nx, x2 + s * nx], [y1 + s * ny, y2 + s * ny], color="black", lw=1.6, ls=ls, zorder=1)
        else:
            ax.plot([x1, x2], [y1, y2], color="black", lw=1.6, ls=ls, zorder=1)
        cx = x1 + (x2 - x1) * label_at + card_offset[0]
        cy = y1 + (y2 - y1) * label_at + card_offset[1]
        ax.text(cx, cy, card, fontsize=14, fontweight="bold", ha="center", va="center", zorder=6,
                bbox=dict(fc="white", ec="none", pad=1))

    # ---- entities ----
    entity("NETWORK_ASSETS", (0, 0))
    entity("TRAFFIC_LOGS", (-14, 0))
    entity("INCIDENTS", (14, 0))
    entity("AUDIT_LOGS", (28, 0))
    entity("USERS", (21, 11))
    entity("SECURITY_PLAYBOOKS", (26, -13))
    entity("TRAFFIC_LOGS_ARCHIVE", (-14, -14))

    # ---- attributes ----
    attributes("NETWORK_ASSETS", [("asset_id", {"pk": True}), "internal_ip", "hostname",
                                  "criticality", "department", "created_at"], 25, 155, r0=4.4, r1=6.4)
    attributes("TRAFFIC_LOGS", [("log_id", {"pk": True}), "attacker_ip", "status", "protocol",
                                "port", "bytes_transferred", "timestamp"], 55, 265, r0=4.8, r1=7.2)
    # placed by hand: this entity has relationships on three sides
    ix, iy = entities["INCIDENTS"]
    for label, (dx, dy), opts in [
        ("incident_id", (-2.4, -3.4), {"pk": True}),
        ("attacker_ip", (-5.9, -2.7), {}),
        ("status", (-6.0, -6.0), {}),
        ("description", (-2.7, -7.3), {}),
        ("blast_radius_score", (0.0, -5.2), {}),
        ("created_at", (0.8, -9.5), {}),
        ("resolved_at", (2.8, -8.0), {}),
    ]:
        attribute((ix, iy), (ix + dx, iy + dy), label, **opts)
    attributes("AUDIT_LOGS", [("audit_id", {"pk": True}), "action", "old_status", "new_status",
                              "notes", "created_at"], -85, 75, r0=4.8, r1=7.0)
    attributes("USERS", [("user_id", {"pk": True}), "username", "password_hash", "role",
                         "created_at"], 15, 165, r0=4.0, r1=6.0)
    attributes("SECURITY_PLAYBOOKS", [("playbook_id", {"pk": True}), "title", "threat_category",
                                      "description", "mitigation", ("vector (384)", {}),
                                      ("tags", {"multi": True})], -165, 10, r0=4.4, r1=7.0)
    attributes("TRAFFIC_LOGS_ARCHIVE", [("log_id", {"pk": True}), "attacker_ip", "target_id", "status",
                                        "protocol", "port", "bytes_transferred", "timestamp",
                                        "archived_at"], 100, 380, r0=4.6, r1=6.6)

    # ---- relationships ----
    na, tl, inc, au, us, pb = (entities[k] for k in
                               ("NETWORK_ASSETS", "TRAFFIC_LOGS", "INCIDENTS", "AUDIT_LOGS", "USERS", "SECURITY_PLAYBOOKS"))

    d = diamond("TARGETS", (-7, 0))
    link(tl, d, "N", total=True, label_at=0.55)
    link(na, d, "1", label_at=0.55)

    d = diamond("AFFECTS", (7, 0))
    link(inc, d, "N", total=True, label_at=0.55)
    link(na, d, "1", label_at=0.55)

    d = diamond("RECORDS", (21, 0))
    link(au, d, "N", total=True, label_at=0.55)
    link(inc, d, "1", label_at=0.55)

    d = diamond("RESOLVES", (17.5, 5.5))
    link(us, d, "1", label_at=0.45, card_offset=(-0.5, 0.2))
    link(inc, d, "N", label_at=0.45, card_offset=(-0.5, 0.2))

    d = diamond("PERFORMS", (24.5, 5.5))
    link(us, d, "1", label_at=0.45, card_offset=(0.5, 0.2))
    link(au, d, "N", total=True, label_at=0.45, card_offset=(0.5, 0.2))

    # recursive relationship on NETWORK_ASSETS (table Asset_Connections)
    d = diamond("CONNECTS\nTO", (0, -8))
    ax.plot([-1.6, -1.6, -1.8], [-0.65, -5.0, -8], color="black", lw=1.6, zorder=1)
    ax.plot([1.6, 1.6, 1.8], [-0.65, -5.0, -8], color="black", lw=1.6, zorder=1)
    ax.text(-2.4, -3.2, "M\n(source)", fontsize=12, fontweight="bold", ha="center", va="center")
    ax.text(2.4, -3.2, "N\n(destination)", fontsize=12, fontweight="bold", ha="center", va="center")
    attribute(d, (-3.2, -11.6), "connection_type")
    attribute(d, (3.2, -11.6), "created_at")

    # derived relationship: playbooks are matched to incidents by vector similarity
    d = diamond("MITIGATED\nBY", (21, -7), dashed=True)
    link(inc, d, "M", dashed=True, label_at=0.45, card_offset=(0.7, 0.3))
    link(pb, d, "N", dashed=True, label_at=0.3, card_offset=(0.6, 0.2))

    ax.text(-23.5, 16.2, "Network Threat Intelligence Platform: ER diagram (Chen notation)",
            fontsize=20, fontweight="bold", va="top")
    legend = ("Rectangle = entity    Ellipse = attribute (bold underlined = primary key)    "
              "Double ellipse = multivalued    Diamond = relationship\n"
              "Double line = total participation    Dashed diamond = derived by vector similarity "
              "(not stored)    CONNECTS TO is stored in the Asset_Connections table\n"
              "TRAFFIC_LOGS_ARCHIVE is filled by the archive_old_logs procedure and deliberately has "
              "no relationship, so archived history survives asset deletion")
    ax.text(-23.5, 15.0, legend, fontsize=12.5, va="top", linespacing=1.6)

    fig.savefig(OUT / "er-diagram.png", dpi=110, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# ============================================================================
# RELATIONAL SCHEMA
# ============================================================================

TABLES = {
    "Users": [
        ("user_id", "SERIAL", "PK"),
        ("username", "VARCHAR(50)", "UNIQUE, NOT NULL"),
        ("password_hash", "VARCHAR(255)", "NOT NULL"),
        ("role", "VARCHAR(20)", "CHECK Admin|Analyst"),
        ("created_at", "TIMESTAMPTZ", "NOT NULL"),
    ],
    "Network_Assets": [
        ("asset_id", "SERIAL", "PK"),
        ("internal_ip", "INET", "UNIQUE, NOT NULL"),
        ("hostname", "VARCHAR(100)", ""),
        ("criticality", "INTEGER", "CHECK 1..10"),
        ("department", "VARCHAR(50)", ""),
        ("created_at", "TIMESTAMPTZ", "NOT NULL"),
    ],
    "Asset_Connections": [
        ("src_asset_id", "INTEGER", "PK, FK"),
        ("dst_asset_id", "INTEGER", "PK, FK"),
        ("connection_type", "VARCHAR(30)", "CHECK 5 values"),
        ("created_at", "TIMESTAMPTZ", "NOT NULL"),
    ],
    "Traffic_Logs": [
        ("log_id", "BIGSERIAL", "PK"),
        ("attacker_ip", "INET", "NOT NULL"),
        ("target_id", "INTEGER", "FK, NOT NULL"),
        ("status", "VARCHAR(20)", "CHECK Allowed|Blocked|Failed"),
        ("protocol", "VARCHAR(20)", ""),
        ("port", "INTEGER", "CHECK 1..65535"),
        ("bytes_transferred", "BIGINT", "CHECK >= 0"),
        ("timestamp", "TIMESTAMPTZ", "NOT NULL"),
    ],
    "Incidents": [
        ("incident_id", "BIGSERIAL", "PK"),
        ("attacker_ip", "INET", "NOT NULL"),
        ("target_id", "INTEGER", "FK, NOT NULL"),
        ("status", "VARCHAR(20)", "CHECK Active|Resolved"),
        ("description", "TEXT", ""),
        ("blast_radius_score", "INTEGER", "NOT NULL"),
        ("created_at", "TIMESTAMPTZ", "NOT NULL"),
        ("resolved_at", "TIMESTAMPTZ", ""),
        ("resolved_by", "INTEGER", "FK"),
    ],
    "Audit_Logs": [
        ("audit_id", "BIGSERIAL", "PK"),
        ("incident_id", "BIGINT", "FK, NOT NULL"),
        ("user_id", "INTEGER", "FK, NOT NULL"),
        ("action", "VARCHAR(50)", "NOT NULL"),
        ("old_status", "VARCHAR(20)", ""),
        ("new_status", "VARCHAR(20)", ""),
        ("notes", "TEXT", ""),
        ("created_at", "TIMESTAMPTZ", "NOT NULL"),
    ],
    "Security_Playbooks": [
        ("playbook_id", "SERIAL", "PK"),
        ("title", "VARCHAR(200)", "UNIQUE, NOT NULL"),
        ("threat_category", "VARCHAR(100)", ""),
        ("description", "TEXT", "NOT NULL"),
        ("mitigation", "TEXT", "NOT NULL"),
        ("vector", "VECTOR(384)", "HNSW index"),
        ("tags", "TEXT[]", ""),
        ("created_at", "TIMESTAMPTZ", "NOT NULL"),
    ],
    "Traffic_Logs_Archive": [
        ("log_id", "BIGINT", "PK"),
        ("attacker_ip", "INET", "NOT NULL"),
        ("target_id", "INTEGER", "NOT NULL, plain copy"),
        ("status", "VARCHAR(20)", "NOT NULL"),
        ("protocol", "VARCHAR(20)", ""),
        ("port", "INTEGER", ""),
        ("bytes_transferred", "BIGINT", "NOT NULL"),
        ("timestamp", "TIMESTAMPTZ", "NOT NULL"),
        ("archived_at", "TIMESTAMPTZ", "NOT NULL"),
    ],
}

# (from_table, from_col, to_table, to_col, on_delete)
FKS = [
    ("Asset_Connections", "src_asset_id", "Network_Assets", "asset_id", "CASCADE"),
    ("Asset_Connections", "dst_asset_id", "Network_Assets", "asset_id", "CASCADE"),
    ("Traffic_Logs", "target_id", "Network_Assets", "asset_id", "RESTRICT"),
    ("Incidents", "target_id", "Network_Assets", "asset_id", "RESTRICT"),
    ("Incidents", "resolved_by", "Users", "user_id", "SET NULL"),
    ("Audit_Logs", "incident_id", "Incidents", "incident_id", "RESTRICT"),
    ("Audit_Logs", "user_id", "Users", "user_id", "RESTRICT"),
]

# grid position (left x, top y) of each table card
POS = {
    "Traffic_Logs": (0, 0),
    "Network_Assets": (16, 0),
    "Incidents": (32, 0),
    "Audit_Logs": (48, 0),
    "Traffic_Logs_Archive": (0, -13),
    "Asset_Connections": (16, -13),
    "Security_Playbooks": (32, -13),
    "Users": (48, -13),
}
CARD_W, ROW_H, HEAD_H = 12.5, 0.85, 1.1
FK_REF = {(ft, fc): (tt, rule) for (ft, fc, tt, tc, rule) in FKS}
COLORS = {"head": "#1f2937", "pk": "#fde68a", "fk": "#dbeafe", "pkfk": "#fde68a"}


def row_y(table, col):
    top = POS[table][1]
    i = [c[0] for c in TABLES[table]].index(col)
    return top - HEAD_H - ROW_H * i - ROW_H / 2


def relational_schema():
    fig, ax = plt.subplots(figsize=(38, 18))
    ax.set_xlim(-1, 62)
    ax.set_ylim(-23, 5)
    ax.set_aspect("equal")
    ax.axis("off")

    for name, cols in TABLES.items():
        x, top = POS[name]
        ax.add_patch(Rectangle((x, top - HEAD_H), CARD_W, HEAD_H, fc=COLORS["head"], ec="black", lw=2, zorder=3))
        ax.text(x + CARD_W / 2, top - HEAD_H / 2, name.upper(), color="white", ha="center", va="center",
                fontsize=14, fontweight="bold", zorder=4)
        for i, (col, typ, cons) in enumerate(cols):
            y = top - HEAD_H - ROW_H * (i + 1)
            is_pk, is_fk = "PK" in cons, cons.startswith("FK") or ", FK" in cons
            fc = COLORS["pk"] if is_pk else COLORS["fk"] if is_fk else "white"
            ax.add_patch(Rectangle((x, y), CARD_W, ROW_H, fc=fc, ec="black", lw=1.2, zorder=3))
            key = "PK" if is_pk and not is_fk else "PK FK" if is_pk else "FK" if is_fk else ""
            ax.text(x + 0.2, y + ROW_H / 2, key, fontsize=9.5, fontweight="bold", va="center", zorder=4)
            t = ax.text(x + 1.55, y + ROW_H / 2, col, fontsize=11.5, va="center", zorder=4,
                        fontweight="bold" if is_pk else "normal", fontstyle="italic" if is_fk else "normal")
            if is_pk:
                w = 0.118 * len(col)
                ax.plot([x + 1.55, x + 1.55 + w], [y + 0.17, y + 0.17], color="black", lw=1, zorder=4)
            ax.text(x + 5.15, y + ROW_H / 2, typ, fontsize=10, va="center", color="#374151", zorder=4)
            if (name, col) in FK_REF:
                # FK rows show what they reference and the ON DELETE rule
                ref, rule = FK_REF[(name, col)]
                extra, color = f"→ {ref}  (ON DELETE {rule})", "#991b1b"
            else:
                extra = cons.replace("PK", "").strip(", ")
                color = "#6b7280"
            ax.text(x + CARD_W - 0.15, y + ROW_H / 2, extra, fontsize=8.5, va="center", ha="right",
                    color=color, zorder=4)

    arrow = dict(arrowstyle="-|>", lw=1.8, color="#b91c1c", mutation_scale=22)

    def elbow(points):
        """Orthogonal path through `points`, arrowhead on the last segment."""
        xs, ys = zip(*points[:-1])
        ax.plot(xs, ys, color="#b91c1c", lw=1.8, zorder=2)
        ax.annotate("", xy=points[-1], xytext=points[-2], arrowprops=arrow, zorder=2)

    # foreign-key arrows: from the FK row's edge to the referenced PK row's edge
    same_col_lane = 0
    for (ft, fc, tt, tc, rule) in FKS:
        fx, ftop = POS[ft]
        tx, ttop = POS[tt]
        y1, y2 = row_y(ft, fc), row_y(tt, tc)
        if tx == fx:
            # same column (Asset_Connections -> Network_Assets): route through the gap on the left
            same_col_lane += 1
            lx = fx - 0.6 * same_col_lane
            elbow([(fx, y1), (lx, y1), (lx, y2), (fx, y2)])
        elif ftop == ttop:
            # side by side on the same row of cards: straight across the gap
            x1, x2 = (fx + CARD_W, tx) if tx > fx else (fx, tx + CARD_W)
            mid = x1 + 0.35 * (x2 - x1)
            elbow([(x1, y1), (mid, y1), (mid, y2), (x2, y2)])
        else:
            # down to the next row of cards: leave from the right edge, enter the target's right edge
            x1, x2 = fx + CARD_W, tx + CARD_W
            lx = max(x1, x2) + 0.9 + (0.8 if fc == "user_id" else 0)
            elbow([(x1, y1), (lx, y1), (lx, y2), (x2, y2)])

    ax.text(-0.5, 4.6, "Network Threat Intelligence Platform: relational schema", fontsize=20,
            fontweight="bold", va="top")
    ax.text(-0.5, 3.3, "Yellow = primary key (bold, underlined)    Blue = foreign key (italic)    "
            "Red arrow = foreign key -> the primary key it references (rule shown in the row)    "
            "Asset_Connections has a composite primary key (src_asset_id, dst_asset_id)",
            fontsize=12.5, va="top")
    ax.text(-0.5, 2.3, "Other constraints: partial unique index on Incidents(attacker_ip, target_id) WHERE "
            "status = 'Active';  CHECK (src_asset_id <> dst_asset_id);  row-level security on Audit_Logs",
            fontsize=12.5, va="top")

    fig.savefig(OUT / "relational-schema.png", dpi=110, bbox_inches="tight", facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    er_diagram()
    relational_schema()
    print("wrote", OUT / "er-diagram.png", "and", OUT / "relational-schema.png")
