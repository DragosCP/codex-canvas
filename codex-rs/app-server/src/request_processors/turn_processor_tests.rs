use super::*;
use pretty_assertions::assert_eq;

fn absolute_path(path: PathBuf) -> AbsolutePathBuf {
    AbsolutePathBuf::from_absolute_path(path).expect("absolute path")
}

#[test]
fn planning_only_profile_reads_project_and_writes_only_artifacts() {
    let artifact_root = absolute_path(std::env::temp_dir().join("codex-plan-mode-artifacts"));

    let profile = planning_only_permission_profile(Some(artifact_root.clone()));

    assert_eq!(
        profile,
        PermissionProfile::Managed {
            file_system: ManagedFileSystemPermissions::Restricted {
                entries: vec![
                    FileSystemSandboxEntry {
                        path: FileSystemPath::Special {
                            value: FileSystemSpecialPath::Root,
                        },
                        access: FileSystemAccessMode::Read,
                    },
                    FileSystemSandboxEntry {
                        path: FileSystemPath::Path {
                            path: artifact_root.clone(),
                        },
                        access: FileSystemAccessMode::Write,
                    },
                ],
                glob_scan_max_depth: None,
            },
            network: NetworkSandboxPolicy::Restricted,
        }
    );
    let file_system_policy = profile.file_system_sandbox_policy();
    let cwd = artifact_root
        .as_path()
        .parent()
        .and_then(|path| path.parent())
        .expect("artifact root includes .codex/mockups");
    assert!(file_system_policy.can_read_path_with_cwd(cwd, cwd));
    assert!(!file_system_policy.can_write_path_with_cwd(cwd, cwd));
    assert!(
        file_system_policy
            .can_write_path_with_cwd(artifact_root.join("mockup.html").as_path(), cwd)
    );
}

#[test]
fn planning_only_profile_without_artifact_root_is_read_only() {
    let profile = planning_only_permission_profile(None);

    assert_eq!(profile, PermissionProfile::read_only());
}
