import ast
from pathlib import Path


def test_websocket_return_types_are_public_exports():
    init_path = Path(__file__).resolve().parents[1] / "pmxt" / "__init__.py"
    tree = ast.parse(init_path.read_text(encoding="utf-8"))

    imported_models = set()
    public_exports = set()

    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "models":
            imported_models.update(alias.name for alias in node.names)
        elif (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == "__all__"
            and isinstance(node.value, ast.List)
        ):
            public_exports.update(
                item.value
                for item in node.value.elts
                if isinstance(item, ast.Constant) and isinstance(item.value, str)
            )

    expected = {"FirehoseEvent", "SubscribedAddressSnapshot"}
    assert expected <= imported_models
    assert expected <= public_exports


def test_legacy_polymarket_us_alias_stays_public():
    init_path = Path(__file__).resolve().parents[1] / "pmxt" / "__init__.py"
    exchanges_path = Path(__file__).resolve().parents[1] / "pmxt" / "_exchanges.py"

    init_tree = ast.parse(init_path.read_text(encoding="utf-8"))
    exchange_imports = set()
    public_exports = set()

    for node in init_tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "_exchanges":
            exchange_imports.update(alias.name for alias in node.names)
        elif (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == "__all__"
            and isinstance(node.value, ast.List)
        ):
            public_exports.update(
                item.value
                for item in node.value.elts
                if isinstance(item, ast.Constant) and isinstance(item.value, str)
            )

    exchanges_tree = ast.parse(exchanges_path.read_text(encoding="utf-8"))
    aliases = {
        node.targets[0].id: node.value.id
        for node in exchanges_tree.body
        if isinstance(node, ast.Assign)
        and len(node.targets) == 1
        and isinstance(node.targets[0], ast.Name)
        and isinstance(node.value, ast.Name)
    }

    assert "Polymarket_us" in exchange_imports
    assert "Polymarket_us" in public_exports
    assert aliases["Polymarket_us"] == "PolymarketUS"
