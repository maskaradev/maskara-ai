import os
import stat

import pytest

from maskara.vault import Stream, Vault


def test_key_file_is_private_and_reused(tmp_path):
    v = Vault(tmp_path / "v.db")
    assert stat.S_IMODE(os.stat(tmp_path / "v.db.key").st_mode) == 0o600
    assert stat.S_IMODE(os.stat(tmp_path / "v.db").st_mode) == 0o600
    lookup = v.lookup("subject", "ns", "user_1")
    v.close()
    assert Vault(tmp_path / "v.db").lookup("subject", "ns", "user_1") == lookup


def test_lookup_normalizes_and_separates_parts():
    v = Vault.from_seed("t")
    assert v.lookup("Jane  DOE") == v.lookup("jane doe")
    assert v.lookup("a", "bc") != v.lookup("ab", "c")
    assert Vault.from_seed("t").lookup("x") == v.lookup("x")
    assert Vault.from_seed("u").lookup("x") != v.lookup("x")
    assert Vault.ephemeral().lookup("x") != Vault.ephemeral().lookup("x")


def test_wrong_key_is_refused(tmp_path):
    Vault(tmp_path / "v.db").close()
    (tmp_path / "other.key").write_text("00" * 32)
    os.chmod(tmp_path / "other.key", 0o600)
    with pytest.raises(ValueError, match="different key"):
        Vault(tmp_path / "v.db", key_path=tmp_path / "other.key")


def test_readable_key_is_refused(tmp_path):
    Vault(tmp_path / "v.db").close()
    os.chmod(tmp_path / "v.db.key", 0o644)
    with pytest.raises(PermissionError):
        Vault(tmp_path / "v.db")


def test_subject_assignment_is_stable_and_names_distinct():
    v = Vault.from_seed("t")
    # Every subject first proposes the same name; later attempts are unique.
    make = lambda subject: lambda attempt: {"name": "Ann Lee" if attempt == 0 else f"Ann Lee {subject}"}
    a = v.subject("ns", "s1", make("s1"))
    b = v.subject("ns", "s2", make("s2"))
    assert a["name"] == "Ann Lee" and b["name"] == "Ann Lee s2"
    assert v.subject("ns", "s1", make("ignored")) == a  # stored, not regenerated
    assert v.subject("other", "s2", make("s2"))["name"] == "Ann Lee"  # namespaces are separate


def test_values_are_injective():
    v = Vault.from_seed("t")
    assert v.value("ns", "ID", "l1", lambda attempt: f"X{attempt}") == "X0"
    assert v.value("ns", "ID", "l2", lambda attempt: f"X{attempt}") == "X1"
    assert v.value("ns", "ID", "l1", lambda attempt: "other") == "X0"
    with pytest.raises(RuntimeError):
        v.value("ns", "ID", "l3", lambda attempt: "X0")


def test_stream_is_deterministic_and_in_range():
    a, b = Stream(b"k"), Stream(b"k")
    draws = [a.between(3, 5) for _ in range(200)]
    assert draws == [b.between(3, 5) for _ in range(200)]
    assert set(draws) == {3, 4, 5}
    s = Stream(b"k")
    picks = [s.weighted(["a", "b"], [1, 100]) for _ in range(500)]
    assert 0 < picks.count("a") < 30
