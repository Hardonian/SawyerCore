//! Deterministic memory utilities for SawyerCore.

use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum MemoryError {
    #[error("arena capacity exceeded")]
    CapacityExceeded,
}

/// Fixed-capacity arena allocator abstraction.
#[derive(Debug)]
pub struct Arena {
    buf: Vec<u8>,
    cursor: usize,
}

impl Arena {
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            buf: vec![0; capacity],
            cursor: 0,
        }
    }

    pub fn capacity(&self) -> usize {
        self.buf.len()
    }

    pub fn used(&self) -> usize {
        self.cursor
    }

    pub fn reset(&mut self) {
        self.cursor = 0;
    }

    pub fn alloc(&mut self, size: usize, alignment: usize) -> Result<&mut [u8], MemoryError> {
        let alignment = alignment.max(1);
        let aligned = (self.cursor + (alignment - 1)) & !(alignment - 1);
        let end = aligned.saturating_add(size);
        if end > self.buf.len() {
            return Err(MemoryError::CapacityExceeded);
        }
        self.cursor = end;
        Ok(&mut self.buf[aligned..end])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arena_alloc_and_reset() {
        let mut arena = Arena::with_capacity(64);
        assert!(arena.alloc(8, 8).is_ok());
        assert!(arena.used() >= 8);
        arena.reset();
        assert_eq!(arena.used(), 0);
    }
}
