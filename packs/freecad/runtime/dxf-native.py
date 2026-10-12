"""Bounded DXF operations. Inputs are data; no scripts or external references run."""
import json
import hashlib
import math
from pathlib import Path
import sys

import ezdxf


def finite(value):
    if type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 1e6:
        raise ValueError("Coordinates must be finite numbers within 1,000,000 mm")
    return value


def point(value):
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError("Expected [x, y] coordinates")
    return [finite(v) for v in value]


def fields(value, names):
    if not isinstance(value, dict) or set(value) - set(names):
        raise ValueError("Unknown DXF fields")


def create(recipe, target):
    fields(recipe, ["units", "entities"])
    if recipe.get("units", "mm") != "mm":
        raise ValueError("This profile uses millimetres")
    entities = recipe.get("entities")
    if not isinstance(entities, list) or not 1 <= len(entities) <= 2000:
        raise ValueError("Supply 1–2000 drawing entities")
    doc = ezdxf.new("R2013", setup=True)
    doc.units = ezdxf.units.MM
    space = doc.modelspace()
    for item in entities:
        kind = item.get("type") if isinstance(item, dict) else None
        allowed = {"line": ["start", "end"], "circle": ["center", "radius"],
                   "polyline": ["points", "closed"], "text": ["text", "position", "height"]}
        if kind not in allowed:
            raise ValueError("Supported types: line, circle, polyline, text")
        fields(item, ["type", "layer", *allowed[kind]])
        layer = item.get("layer", "0")
        if not isinstance(layer, str) or not layer or len(layer) > 128 or any(c in layer for c in '<>/\\":;?*|=\n\r'):
            raise ValueError("Invalid layer name")
        if layer not in doc.layers:
            doc.layers.new(layer)
        attrs = {"layer": layer}
        if kind == "line":
            space.add_line(point(item["start"]), point(item["end"]), dxfattribs=attrs)
        elif kind == "circle":
            radius = finite(item["radius"])
            if radius <= 0:
                raise ValueError("Circle radius must be positive")
            space.add_circle(point(item["center"]), radius, dxfattribs=attrs)
        elif kind == "polyline":
            points = item.get("points")
            if not isinstance(points, list) or not 2 <= len(points) <= 1000 or type(item.get("closed", False)) is not bool:
                raise ValueError("Polyline needs 2–1000 points and a boolean closed flag")
            space.add_lwpolyline([point(p) for p in points], close=item.get("closed", False), dxfattribs=attrs)
        else:
            text = item.get("text")
            height = finite(item.get("height", 2.5))
            if not isinstance(text, str) or not text or len(text) > 1000 or height <= 0:
                raise ValueError("Text and positive height are required")
            space.add_text(text, dxfattribs={**attrs, "height": height, "insert": point(item["position"])})
    doc.saveas(target)


def observe(source):
    doc = ezdxf.readfile(source)
    audit = doc.audit()
    entities = []
    for e in doc.modelspace():
        if len(entities) >= 2000:
            raise ValueError("Drawing exceeds the 2000 entity observation limit")
        row = {"handle": e.dxf.handle, "type": e.dxftype(), "layer": e.dxf.layer}
        if e.dxftype() == "CIRCLE":
            row.update(center=list(e.dxf.center)[:2], centerZ=e.dxf.center.z,
                       extrusion=list(e.dxf.extrusion), radius=e.dxf.radius)
        elif e.dxftype() == "LINE":
            row.update(start=list(e.dxf.start)[:2], end=list(e.dxf.end)[:2])
        elif e.dxftype() == "LWPOLYLINE":
            if len(e) > 1000:
                raise ValueError("Polyline observation limit exceeded")
            row.update(points=[list(p[:2]) for p in e.get_points()], closed=e.closed)
        elif e.dxftype() == "TEXT":
            row.update(text=e.dxf.text, position=list(e.dxf.insert)[:2], height=e.dxf.height)
        entities.append(row)
    counts = {}
    for row in entities:
        counts[row["type"]] = counts.get(row["type"], 0) + 1
    return {"schemaVersion": 1, "engine": "ezdxf", "engineVersion": ezdxf.__version__,
            "sourceSha256": hashlib.sha256(Path(source).read_bytes()).hexdigest(),
            "units": doc.units, "entityCount": len(entities), "counts": counts,
            "auditErrors": len(audit.errors), "auditFixes": len(audit.fixes), "entities": entities,
            "scope": "DXF syntax and measured geometry; not manufacturing or DWG compatibility"}


def main():
    request = json.loads(Path(sys.argv[1]).read_text())
    fields(request, ["operation", "recipe", "source"])
    operation = request["operation"]
    work = Path(sys.argv[2]).resolve()
    if operation == "create":
        source = work / "drawing.dxf"
        create(request["recipe"], source)
    elif operation in ("inspect", "verify"):
        source = Path(request["source"])
    else:
        raise ValueError("Unknown DXF operation")
    # Reopen saved bytes; generation success alone is never a geometry verdict.
    report = observe(source)
    (work / "readback.json").write_text(json.dumps(report, ensure_ascii=False, allow_nan=False))
    print(json.dumps({"readback": "readback.json", "engineVersion": ezdxf.__version__}))


if __name__ == "__main__":
    main()
