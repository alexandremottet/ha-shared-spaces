import pytest


@pytest.fixture(autouse=True)
def isolated_config_dir(hass, tmp_path):
    hass.config.config_dir = str(tmp_path)


