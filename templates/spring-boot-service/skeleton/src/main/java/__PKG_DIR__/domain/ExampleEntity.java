package __JAVA_PKG__.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * The example resource as it is stored.
 *
 * <p>{@code createdAt} is set on construction rather than by the database, so the value is the
 * moment the application made the object and not the moment the row was written.
 */
@Entity
@Table(name = "examples")
public class ExampleEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, length = 120)
  private String name;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  /** Required by JPA, which instantiates the entity before populating it. Not for callers. */
  protected ExampleEntity() {}

  /**
   * Creates an example with a name.
   *
   * @param name the example's name; the column caps it at 120 characters and rejects null
   */
  public ExampleEntity(String name) {
    this.name = name;
  }

  public Long getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
