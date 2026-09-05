package __JAVA_PKG__.service;

import __JAVA_PKG__.domain.ExampleEntity;
import __JAVA_PKG__.repository.ExampleRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Transactional boundary for the example resource.
 *
 * <p>The class-level {@code @Transactional} makes every public method a unit of work; the read
 * paths narrow it to {@code readOnly}, which lets the driver skip dirty-checking and lets a replica
 * serve the query.
 */
@Service
@Transactional
public class ExampleService {

  private final ExampleRepository repo;

  /**
   * Binds the service to its repository.
   *
   * @param repo the repository this service reads and writes through
   */
  public ExampleService(ExampleRepository repo) {
    this.repo = repo;
  }

  /**
   * Reads every example.
   *
   * @return every example, unpaged — a listing that outgrows one response is the caller's to page
   */
  @Transactional(readOnly = true)
  public List<ExampleEntity> list() {
    return repo.findAll();
  }

  /**
   * Reads one example by identifier.
   *
   * @param id the identifier to look up
   * @return the example, or empty when no row carries that id
   */
  @Transactional(readOnly = true)
  public Optional<ExampleEntity> find(Long id) {
    return repo.findById(id);
  }

  /**
   * Creates an example.
   *
   * @param name the example's name; blank is rejected here rather than at the column, so the caller
   *     gets an argument error instead of a constraint violation
   * @return the persisted example, carrying the identifier the database assigned
   * @throws IllegalArgumentException if {@code name} is null or blank
   */
  public ExampleEntity create(String name) {
    if (name == null || name.isBlank()) {
      throw new IllegalArgumentException("name must not be blank");
    }
    return repo.save(new ExampleEntity(name));
  }

  /**
   * Deletes the example with this id, and does nothing when no row carries it.
   *
   * @param id the identifier to remove
   */
  public void delete(Long id) {
    repo.deleteById(id);
  }
}
