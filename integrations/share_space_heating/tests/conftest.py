import pytest

from custom_components.share_space_heating import detect


def pytest_configure(config):
    config.addinivalue_line("markers", "auto_zones: let Share Space set up zones on its own")


@pytest.fixture(autouse=True)
def isolated_config_dir(hass, tmp_path):
    hass.config.config_dir = str(tmp_path)


@pytest.fixture(autouse=True)
def no_auto_zones(request, monkeypatch):
    """Tests building zones by hand would race the automatic ones."""
    if request.node.get_closest_marker("auto_zones") is None:

        async def _skip(hass):
            return None

        monkeypatch.setattr(detect, "async_auto_zones", _skip)
