const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe_mod = b.createModule(.{
        .root_source_file = b.path("src/terminal.zig"),
        .target = target,
        .optimize = optimize,
        .strip = optimize != .Debug,
    });

    const exe = b.addExecutable(.{
        .name = "terminal",
        .root_module = exe_mod,
    });

    exe.entry = .disabled;
    exe.rdynamic = true;

    const ghostty_dep = b.dependency("ghostty", .{
        .target = target,
        .optimize = optimize,
        .simd = false,
    });
    exe.root_module.addImport("ghostty-vt", ghostty_dep.module("ghostty-vt"));

    b.installArtifact(exe);
}
